using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace CanonBridge.Edsdk;

/// <summary>
/// Real EDSDK-backed implementation of ICameraSession. EDSDK is not
/// free-threaded and requires periodic EdsGetEvent pumping, so every EDSDK
/// call is marshaled onto one dedicated pump thread via a work queue —
/// skipping this is the #1 way a naive port hangs on capture.
/// </summary>
public sealed class CameraSession : global::CanonBridge.ICameraSession
{
    private readonly string _capturesDir;
    private readonly BlockingCollection<Action> _workQueue = new();
    private readonly Thread _pumpThread;
    private readonly CancellationTokenSource _pumpCts = new();

    private IntPtr _cameraRef = IntPtr.Zero;
    private bool _sessionOpen;
    private bool _liveViewOn;

    // Keep delegate instances alive for the lifetime of the session — EDSDK
    // holds a native pointer to them, GC would otherwise collect and crash.
    private NativeMethods.EdsObjectEventHandler? _objectEventHandler;
    private TaskCompletionSource<IntPtr>? _pendingCaptureItem;

    public CameraSession(string capturesDir)
    {
        _capturesDir = capturesDir;
        Directory.CreateDirectory(_capturesDir);

        EdsdkException.Check(NativeMethods.EdsInitializeSDK(), "EdsInitializeSDK");

        _pumpThread = new Thread(PumpLoop) { IsBackground = true, Name = "edsdk-pump" };
        _pumpThread.Start();
    }

    /// <summary>Runs an EDSDK call on the pump thread and waits for the result. All EDSDK access must go through here.</summary>
    private T RunOnPump<T>(Func<T> work)
    {
        var tcs = new TaskCompletionSource<T>();
        _workQueue.Add(() =>
        {
            try { tcs.SetResult(work()); }
            catch (Exception ex) { tcs.SetException(ex); }
        });
        return tcs.Task.GetAwaiter().GetResult();
    }

    private void PumpLoop()
    {
        while (!_pumpCts.IsCancellationRequested)
        {
            if (_workQueue.TryTake(out var action, 50))
                action();
            NativeMethods.EdsGetEvent(); // pump SDK message queue (also fires event callbacks)
        }
    }

    public IReadOnlyList<(string Model, string Port)> ListCameras() => RunOnPump(() =>
    {
        var result = new List<(string, string)>();
        EdsdkException.Check(NativeMethods.EdsGetCameraList(out var listRef), "EdsGetCameraList");
        try
        {
            EdsdkException.Check(NativeMethods.EdsGetChildCount(listRef, out var count), "EdsGetChildCount");
            for (int i = 0; i < count; i++)
            {
                EdsdkException.Check(NativeMethods.EdsGetChildAtIndex(listRef, i, out var camRef), "EdsGetChildAtIndex");
                try
                {
                    EdsdkException.Check(NativeMethods.EdsGetDeviceInfo(camRef, out var info), "EdsGetDeviceInfo");
                    result.Add((info.szDeviceDescription, info.szPortName));
                }
                finally { NativeMethods.EdsRelease(camRef); }
            }
        }
        finally { NativeMethods.EdsRelease(listRef); }
        return (IReadOnlyList<(string, string)>)result;
    });

    /// <summary>Opens (or reuses) a session on the first detected camera. `port` is currently ignored beyond presence — EDSDK enumeration order is used, matching the single-booth-camera deployment this bridge targets.</summary>
    private void EnsureSessionOpen()
    {
        if (_sessionOpen) return;

        RunOnPump<object?>(() =>
        {
            EdsdkException.Check(NativeMethods.EdsGetCameraList(out var listRef), "EdsGetCameraList");
            try
            {
                EdsdkException.Check(NativeMethods.EdsGetChildCount(listRef, out var count), "EdsGetChildCount");
                if (count == 0) throw new EdsdkException(EdsdkConstants.EDS_ERR_DEVICE_NOT_FOUND, "EdsGetChildCount");
                EdsdkException.Check(NativeMethods.EdsGetChildAtIndex(listRef, 0, out _cameraRef), "EdsGetChildAtIndex");
            }
            finally { NativeMethods.EdsRelease(listRef); }

            EdsdkException.Check(NativeMethods.EdsOpenSession(_cameraRef), "EdsOpenSession");

            _objectEventHandler = OnObjectEvent;
            EdsdkException.Check(
                NativeMethods.EdsSetObjectEventHandler(_cameraRef, EdsdkConstants.kEdsObjectEvent_All, _objectEventHandler, IntPtr.Zero),
                "EdsSetObjectEventHandler");

            _sessionOpen = true;
            return null;
        });
    }

    private uint OnObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext)
    {
        if (inEvent == EdsdkConstants.kEdsObjectEvent_DirItemCreated)
            _pendingCaptureItem?.TrySetResult(inRef);
        return EdsdkConstants.EDS_ERR_OK;
    }

    public (bool Success, string? FilePath, string? Error) Capture(string? port)
    {
        try
        {
            EnsureSessionOpen();
            StopLiveViewIfNeeded(); // some bodies require EVF off during a still capture

            var tcs = new TaskCompletionSource<IntPtr>();
            _pendingCaptureItem = tcs;

            RunOnPump<object?>(() =>
            {
                EdsdkException.Check(
                    NativeMethods.EdsSendCommand(_cameraRef, EdsdkConstants.kEdsCameraCommand_TakePicture, 0),
                    "EdsSendCommand(TakePicture)");
                return null;
            });

            IntPtr dirItemRef;
            if (!tcs.Task.Wait(TimeSpan.FromSeconds(10)))
                return (false, null, "capture timed out waiting for camera (10s) — check EDSDK pump thread / camera state");
            dirItemRef = tcs.Task.Result;
            _pendingCaptureItem = null;

            var path = Path.Combine(_capturesDir, $"{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss-fff}.jpg");
            RunOnPump<object?>(() => { DownloadDirItem(dirItemRef, path); return null; });

            return (true, path, null);
        }
        catch (EdsdkException ex)
        {
            return (false, null, ex.Message);
        }
    }

    private void DownloadDirItem(IntPtr dirItemRef, string destPath)
    {
        try
        {
            EdsdkException.Check(NativeMethods.EdsGetDirItemInfo(dirItemRef, out var info), "EdsGetDirItemInfo");
            EdsdkException.Check(NativeMethods.EdsCreateFileStream(destPath,
                EdsdkConstants.kEdsFileCreateDisposition_CreateAlways, EdsdkConstants.kEdsAccess_Read, out var stream),
                "EdsCreateFileStream");
            try
            {
                EdsdkException.Check(NativeMethods.EdsDownload(dirItemRef, info.Size, stream), "EdsDownload");
                EdsdkException.Check(NativeMethods.EdsDownloadComplete(dirItemRef), "EdsDownloadComplete");
            }
            finally { NativeMethods.EdsRelease(stream); }
        }
        finally { NativeMethods.EdsRelease(dirItemRef); }
    }

    public (byte[]? Jpeg, string? Error) GetLiveViewFrame()
    {
        try
        {
            EnsureSessionOpen();
            StartLiveViewIfNeeded();

            return RunOnPump(() =>
            {
                EdsdkException.Check(NativeMethods.EdsCreateMemoryStream(0, out var stream), "EdsCreateMemoryStream");
                try
                {
                    var err = NativeMethods.EdsDownloadEvfImage(_cameraRef, stream);
                    if (err != EdsdkConstants.EDS_ERR_OK)
                        return ((byte[]?)null, new EdsdkException(err, "EdsDownloadEvfImage").Message);

                    EdsdkException.Check(NativeMethods.EdsGetLength(stream, out var length), "EdsGetLength");
                    EdsdkException.Check(NativeMethods.EdsGetPointer(stream, out var ptr), "EdsGetPointer");
                    var bytes = new byte[length];
                    Marshal.Copy(ptr, bytes, 0, (int)length);
                    return (bytes, (string?)null);
                }
                finally { NativeMethods.EdsRelease(stream); }
            });
        }
        catch (EdsdkException ex)
        {
            return (null, ex.Message);
        }
    }

    private void StartLiveViewIfNeeded()
    {
        if (_liveViewOn) return;
        RunOnPump<object?>(() =>
        {
            SetUintProperty(EdsdkConstants.kEdsPropID_Evf_OutputDevice, EdsdkConstants.kEdsEvfOutputDevice_PC);
            return null;
        });
        _liveViewOn = true;
    }

    private void StopLiveViewIfNeeded()
    {
        if (!_liveViewOn) return;
        RunOnPump<object?>(() =>
        {
            SetUintProperty(EdsdkConstants.kEdsPropID_Evf_OutputDevice, EdsdkConstants.kEdsEvfOutputDevice_TFT);
            return null;
        });
        _liveViewOn = false;
    }

    private void SetUintProperty(uint propertyId, uint value)
    {
        var ptr = Marshal.AllocHGlobal(sizeof(uint));
        try
        {
            Marshal.WriteInt32(ptr, unchecked((int)value));
            EdsdkException.Check(
                NativeMethods.EdsSetPropertyData(_cameraRef, propertyId, 0, sizeof(uint), ptr),
                "EdsSetPropertyData");
        }
        finally { Marshal.FreeHGlobal(ptr); }
    }

    public void Dispose()
    {
        try
        {
            if (_sessionOpen)
            {
                RunOnPump<object?>(() =>
                {
                    StopLiveViewIfNeeded();
                    NativeMethods.EdsCloseSession(_cameraRef);
                    return null;
                });
            }
        }
        catch { /* never fail shutdown */ }

        _pumpCts.Cancel();
        _workQueue.CompleteAdding();
        _pumpThread.Join(TimeSpan.FromSeconds(2));

        try { NativeMethods.EdsTerminateSDK(); } catch { /* never fail shutdown */ }
    }
}

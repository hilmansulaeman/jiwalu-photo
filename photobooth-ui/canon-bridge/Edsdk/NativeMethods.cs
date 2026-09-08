using System.Runtime.InteropServices;

namespace CanonBridge.Edsdk;

/// <summary>
/// Thin P/Invoke surface over EDSDK.dll — only the calls CameraSession
/// actually uses. Not a full EDSDK.h port. Requires EDSDK.dll to sit next to
/// this process's executable at runtime (drop the Canon-provided DLL into
/// vendor/edsdk/ at build time, or next to the published exe at deploy time).
/// </summary>
internal static class NativeMethods
{
    private const string Dll = "EDSDK.dll";

    // Delegate types for EDSDK callbacks.
    public delegate uint EdsObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);
    public delegate uint EdsStateEventHandler(uint inEvent, uint inEventData, IntPtr inContext);
    public delegate uint EdsProgressCallback(uint inPercent, IntPtr inContext, ref bool outCancel);

    [DllImport(Dll)] public static extern uint EdsInitializeSDK();
    [DllImport(Dll)] public static extern uint EdsTerminateSDK();

    [DllImport(Dll)] public static extern uint EdsGetCameraList(out IntPtr outCameraListRef);
    [DllImport(Dll)] public static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);
    [DllImport(Dll)] public static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outChildRef);
    [DllImport(Dll)] public static extern uint EdsGetDeviceInfo(IntPtr inCameraRef, out EdsDeviceInfo outDeviceInfo);

    [DllImport(Dll)] public static extern uint EdsOpenSession(IntPtr inCameraRef);
    [DllImport(Dll)] public static extern uint EdsCloseSession(IntPtr inCameraRef);

    [DllImport(Dll)] public static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);
    [DllImport(Dll)] public static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, IntPtr inPropertyData);
    [DllImport(Dll)] public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, IntPtr outPropertyData);

    [DllImport(Dll)] public static extern uint EdsSetObjectEventHandler(IntPtr inCameraRef, uint inEvent, EdsObjectEventHandler inObjectEventHandler, IntPtr inContext);
    [DllImport(Dll)] public static extern uint EdsSetCameraStateEventHandler(IntPtr inCameraRef, uint inEvent, EdsStateEventHandler inStateEventHandler, IntPtr inContext);
    [DllImport(Dll)] public static extern uint EdsGetEvent();

    [DllImport(Dll)] public static extern uint EdsCreateFileStream(string inFileName, uint inCreateDisposition, uint inDesiredAccess, out IntPtr outStream);
    [DllImport(Dll)] public static extern uint EdsCreateMemoryStream(ulong inBufferSize, out IntPtr outStream);
    [DllImport(Dll)] public static extern uint EdsGetPointer(IntPtr inStreamRef, out IntPtr outPointer);
    [DllImport(Dll)] public static extern uint EdsGetLength(IntPtr inStreamRef, out ulong outLength);

    [DllImport(Dll)] public static extern uint EdsDownload(IntPtr inDirItemRef, ulong inReadSize, IntPtr outStream);
    [DllImport(Dll)] public static extern uint EdsDownloadComplete(IntPtr inDirItemRef);
    [DllImport(Dll)] public static extern uint EdsDownloadEvfImage(IntPtr inCameraRef, IntPtr outStream);
    [DllImport(Dll)] public static extern uint EdsGetDirItemInfo(IntPtr inDirItemRef, out EdsDirectoryItemInfo outDirItemInfo);

    [DllImport(Dll)] public static extern uint EdsRelease(IntPtr inRef);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct EdsDeviceInfo
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szPortName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDeviceDescription;
        public uint DeviceSubType;
        public uint reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct EdsDirectoryItemInfo
    {
        public ulong Size;
        public int isFolder;
        public uint GroupID;
        public uint Option;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szFileName;
        public uint format;
        public uint dateTime;
    }
}

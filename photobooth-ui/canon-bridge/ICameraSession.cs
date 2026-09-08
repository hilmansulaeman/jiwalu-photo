namespace CanonBridge;

/// <summary>
/// The one seam between the HTTP layer and the camera backend. Real
/// implementation (Edsdk/CameraSession.cs) talks to Canon's EDSDK.dll via
/// P/Invoke; MockCameraSession fakes it for testing without hardware.
/// </summary>
public interface ICameraSession : IDisposable
{
    IReadOnlyList<(string Model, string Port)> ListCameras();

    /// <param name="port">Opaque port string as returned by ListCameras, or null/empty for "first detected camera".</param>
    (bool Success, string? FilePath, string? Error) Capture(string? port);

    (byte[]? Jpeg, string? Error) GetLiveViewFrame();
}

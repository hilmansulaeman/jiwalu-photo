namespace CanonBridge.Edsdk;

/// <summary>
/// Subset of EDSDK.h constants actually used by CameraSession. Values are
/// taken from Canon's EDSDK.h header (same across SDK versions for these
/// core symbols) — verify against the header shipped with your SDK version
/// if EDSDK ever returns EDS_ERR_ILLEGAL_PARAMETER on a call using these.
/// </summary>
internal static class EdsdkConstants
{
    // --- Error codes (EdsError) ---
    public const uint EDS_ERR_OK = 0x00000000;
    public const uint EDS_ERR_DEVICE_BUSY = 0x00000082;
    public const uint EDS_ERR_DEVICE_NOT_FOUND = 0x00000083;

    // --- Property IDs (EdsPropertyID) ---
    public const uint kEdsPropID_Evf_OutputDevice = 0x00000500;

    // --- Evf output device flags ---
    public const uint kEdsEvfOutputDevice_TFT = 0x00000001;
    public const uint kEdsEvfOutputDevice_PC = 0x00000002;

    // --- Camera commands (EdsCameraCommand) ---
    public const uint kEdsCameraCommand_TakePicture = 0x00000000;

    // --- Object events (EdsObjectEvent) ---
    public const uint kEdsObjectEvent_All = 0x00000200;
    public const uint kEdsObjectEvent_DirItemCreated = 0x00000208;
    public const uint kEdsObjectEvent_DirItemRequestTransfer = 0x0000020C;

    // --- State events (EdsStateEvent) ---
    public const uint kEdsStateEvent_All = 0x00000300;

    // --- Misc ---
    public const uint kEdsAccess_Read = 0;
    public const uint kEdsFileCreateDisposition_CreateAlways = 2;
    public const uint kEdsProgressOption_Done = 3;
}

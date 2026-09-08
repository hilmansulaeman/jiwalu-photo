namespace CanonBridge.Edsdk;

/// <summary>
/// Wraps an EDSDK error code into a short, human-readable message safe to
/// surface in the {success,url,error} HTTP contract — never leak raw
/// exception stack traces to the client.
/// </summary>
public sealed class EdsdkException : Exception
{
    public uint ErrorCode { get; }

    public EdsdkException(uint errorCode, string operation)
        : base($"{operation} failed: EDSDK error 0x{errorCode:X8} ({Describe(errorCode)})")
    {
        ErrorCode = errorCode;
    }

    private static string Describe(uint code) => code switch
    {
        EdsdkConstants.EDS_ERR_DEVICE_BUSY => "device busy — close EOS Utility or other EDSDK apps",
        EdsdkConstants.EDS_ERR_DEVICE_NOT_FOUND => "no camera detected",
        _ => "see EDSDK.h for this code",
    };

    /// <summary>Throws if the EDSDK call result is not EDS_ERR_OK.</summary>
    public static void Check(uint result, string operation)
    {
        if (result != EdsdkConstants.EDS_ERR_OK)
            throw new EdsdkException(result, operation);
    }
}

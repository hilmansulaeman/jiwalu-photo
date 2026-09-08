using CanonBridge;
using CanonBridge.Edsdk;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

var listenUrl = builder.Configuration["ListenUrl"] ?? "http://127.0.0.1:8788";
builder.WebHost.UseUrls(listenUrl);

var capturesDir = Path.Combine(AppContext.BaseDirectory, builder.Configuration["CapturesDir"] ?? "captures");
Directory.CreateDirectory(capturesDir);

bool mock = args.Contains("--mock")
    || string.Equals(Environment.GetEnvironmentVariable("CANON_BRIDGE_MOCK"), "1")
    || string.Equals(builder.Configuration["Mode"], "mock", StringComparison.OrdinalIgnoreCase);

ICameraSession session = mock ? new MockCameraSession(capturesDir) : new CameraSession(capturesDir);
builder.Services.AddSingleton(session);

var app = builder.Build();

app.Lifetime.ApplicationStopping.Register(() =>
{
    try { session.Dispose(); } catch { /* never fail shutdown */ }
});

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(capturesDir),
    RequestPath = "/captures",
});

app.Logger.LogInformation("Canon EDSDK bridge starting, mode={Mode}, listen={ListenUrl}", mock ? "mock" : "edsdk", listenUrl);

app.MapGet("/api/cameras", (ICameraSession s) =>
    Results.Json(s.ListCameras().Select(c => new { model = c.Model, port = c.Port })));

app.MapPost("/api/cameras/capture", (HttpRequest req, ICameraSession s) => HandleCapture(req, s, null));
app.MapPost("/api/cameras/{port}/capture", (string port, HttpRequest req, ICameraSession s) => HandleCapture(req, s, port));

app.MapGet("/api/liveview", (ICameraSession s) =>
{
    var (jpeg, err) = s.GetLiveViewFrame();
    return jpeg is null
        ? Results.Text(err ?? "live view unavailable", "text/plain", statusCode: StatusCodes.Status502BadGateway)
        : Results.File(jpeg, "image/jpeg");
});

app.Run();

static IResult HandleCapture(HttpRequest req, ICameraSession s, string? port)
{
    var (ok, path, err) = s.Capture(port);
    if (!ok || path is null)
        return Results.Json(new { success = false, url = "", error = err ?? "capture failed" }, statusCode: StatusCodes.Status502BadGateway);

    var fileName = Path.GetFileName(path);
    var baseUrl = $"{req.Scheme}://{req.Host}"; // reflects whatever ListenUrl the bridge actually bound to
    return Results.Json(new { success = true, url = $"{baseUrl}/captures/{fileName}", error = "" });
}

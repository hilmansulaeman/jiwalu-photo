// The customer experience remains a React application. Tauri only owns the
// native kiosk window, keeping web and admin routes independent.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start Urbanmen Photo Kiosk");
}

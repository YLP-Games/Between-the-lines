import UIKit

// The iPad app is the web app (index.html) in a window of its own, with the things a web page can't do added around it:
// the Apple Pencil's double tap and squeeze, files handed over from the Files app, and saving through the Share sheet.

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool { true }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = WebViewController.shared
        window.makeKeyAndVisible()
        self.window = window
        open(options.urlContexts)           // (the app was started by opening a file with it)
    }

    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) { open(contexts) }

    private func open(_ contexts: Set<UIOpenURLContext>) {
        for c in contexts where c.url.isFileURL { WebViewController.shared.open(fileAt: c.url) }
    }
}

import UIKit
import Capacitor

// The shell: Capacitor's bridge view controller loading the live site (capacitor.config.json server.url), plus the
// one thing Capacitor leaves to a plugin — a UNIVERSAL LINK (a https link to the site's own host, App.entitlements'
// associated domains) opens THAT page in the WebView, on a cold start or a warm one, instead of the Feed.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // launched by a link: the page it names, once the bridge has its WebView
        if let activity = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }) {
            openSiteLink(activity.webpageURL)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb {
            openSiteLink(userActivity.webpageURL)
        }
    }

    /// Loads a https URL whose host the shell may navigate to (server.url and allowNavigation); any other link
    /// is left to Capacitor, which hands it to the system.
    private func openSiteLink(_ url: URL?) {
        guard let url = url, url.scheme == "https", let host = url.host,
              let controller = window?.rootViewController as? CAPBridgeViewController,
              let bridge = controller.bridge,
              host == bridge.config.serverURL.host || bridge.config.shouldAllowNavigation(to: host)
        else { return }
        bridge.webView?.load(URLRequest(url: url))
    }
}

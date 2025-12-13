# Linkus Linux (Electron)

Unofficial Linkus client for Linux that acts as a `tel:` protocol handler.
When a `tel:` URL is opened (e.g., `tel:+50255646547`), the app opens your configured Yeastar P-Series PBX, fills in the number, and initiates the call.

## Installation and Development Usage

1. Install dependencies:

```sh
cd /path/to/linkus-linux
npm install
```

2. Run in development mode:

```sh
npm run start
```

> **Note about session:** The app stores cookies/localStorage in `~/.linkus-linux`. As long as you don't delete that folder, Linkus should remain authenticated between restarts. Delete that path if you need to force a logout.

3. Register the application as `tel:` handler:

	**Quick option (development):**

	```sh
	npm run register:tel
	```

	This script creates `~/.local/share/applications/linkus-linux-dev.desktop`, points to the Electron binary within the project, and registers the `tel` scheme using `xdg-mime`.

	**Manual option:**

Save this file as `~/.local/share/applications/linkus-linux.desktop` (change `Exec` to the absolute path to your project and electron if not packaged):

```
[Desktop Entry]
Name=Linkus Linux
Exec=/usr/bin/env electron /path/to/linkus-linux %u
Type=Application
NoDisplay=false
Categories=Network;
MimeType=x-scheme-handler/tel;
```

Then update the registry:

```sh
update-desktop-database ~/.local/share/applications || true
xdg-mime default linkus-linux.desktop x-scheme-handler/tel
```

Now click on any `tel:` link (for example from a web browser) and your app should receive the URL.

## Build Installable Package (AppImage)

1. Build AppImage:

```sh
npm run dist
```

2. The resulting AppImage will be in `dist/` and when installed (executed), the packaged installer will attempt to register the `tel` scheme automatically on compatible systems.

## Notes and Recommendations

- `app.setAsDefaultProtocolClient('tel')` works best when the app is packaged. For development, it's more reliable to create the `.desktop` file and register with `xdg-mime`.
- If your PBX web interface DOM changes, you may need to adjust the selectors in `main.js` (`input.ant-input[placeholder*="Número"]` and `button.ant-btn.item-call`).
- If you want the app to open in the background or without UI when receiving a `tel:`, we can modify `createWindow` to create a hidden window and show only when necessary.

## Generate .deb Package for Ubuntu/Debian

## Generate .deb Package for Ubuntu/Debian

Use the included script to build the reusable .deb package:

```sh
npm run build:deb
# or directly:
./scripts/build-deb.sh
```

The .deb file will be in `dist/`. To install:

```sh
sudo dpkg -i dist/linkus-linux_*.deb
sudo apt-get install -f  # resolve dependencies if needed
```

To uninstall:

```sh
sudo apt remove linkus-linux
```

The package automatically registers the `tel:` handler during installation on systems with `xdg-utils`.

## Releases and Distribution

## Releases and Distribution

The project uses GitHub Actions to automatically generate Linux packages on each release:

- **Debian/Ubuntu (.deb)** - For Debian-based distributions
- **Fedora/RHEL (.rpm)** - For Red Hat-based distributions
- **AppImage** - Universal package for any Linux distribution

### Creating a Release

1. Create and push a tag:
   ```sh
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin v0.2.0
   ```

2. Create the release on GitHub (the workflow will automatically generate packages and changelog)

3. The packages will be available as release assets

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details on commit conventions and versioning.

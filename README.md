# Linkus Linux

<div align="center">

![Linkus Linux Logo](icon.png)

**Unofficial Linkus client for Linux - Desktop app for Yeastar P-Series PBX**

[![GitHub release](https://img.shields.io/github/v/release/aalonzolu/linkus-linux)](https://github.com/aalonzolu/linkus-linux/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/aalonzolu/linkus-linux)](https://github.com/aalonzolu/linkus-linux/issues)
[![GitHub stars](https://img.shields.io/github/stars/aalonzolu/linkus-linux)](https://github.com/aalonzolu/linkus-linux/stargazers)

</div>

---

## 📋 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Development](#-development)
- [Building](#-building)
- [Contributing](#-contributing)
- [Bug Reports](#-bug-reports)
- [License](#-license)
- [Disclaimer](#-disclaimer)

## About

Linkus Linux is an unofficial desktop application for Linux that integrates Yeastar P-Series PBX's Linkus web client with your system. It acts as a `tel:` protocol handler, allowing you to click phone numbers in web pages, CRMs, or other applications and automatically initiate calls through your PBX.

**Key capabilities:**
- Native Linux desktop integration
- `tel:` protocol handler (click-to-call from any application)
- System tray support with notification badges
- Audio/video call support via WebRTC
- Notification system for incoming calls and messages
- Minimize to tray functionality
- Auto-start on boot option

##  Features

-  **Native Linux Desktop App** - Built with Electron for seamless integration
-  **Tel Protocol Handler** - Click phone numbers anywhere to make calls
-  **System Notifications** - Get notified of incoming calls and messages
-  **Audio Support** - Ring tones and notification sounds using system audio
-  **Video Calls** - Full WebRTC support for audio/video calls
-  **System Tray** - Minimize to tray with badge count for notifications
-  **Auto-start** - Option to start on system boot
-  **Session Persistence** - Stay logged in between restarts
-  **Multi-server** - Configure any Yeastar P-Series PBX server
-  **Bilingual** - English and Spanish interface

##  Installation

### Download Pre-built Packages

Download the latest release for your distribution from the [Releases page](https://github.com/aalonzolu/linkus-linux/releases):

#### Debian/Ubuntu (.deb)

```bash
sudo dpkg -i linkus-linux_*.deb
sudo apt-get install -f  # Install dependencies if needed
```

#### Fedora/RHEL/openSUSE (.rpm)

```bash
sudo rpm -i linkus-linux-*.rpm
```

#### AppImage (Universal)

```bash
chmod +x Linkus-Linux-*.AppImage
./Linkus-Linux-*.AppImage
```

### System Requirements

- **OS**: Linux (any modern distribution)
- **Audio**: PulseAudio, ALSA, or compatible audio system
- **Dependencies**: GTK3, libnotify, NSS, libXss (auto-installed with .deb/.rpm)

##  Usage

### First Run

1. Launch Linkus Linux from your application menu
2. Configure your Yeastar P-Series PBX server URL
3. The app will validate the server and save your configuration
4. Log in with your Linkus credentials
5. You're ready to make and receive calls!

### Click-to-Call

Once installed, clicking any `tel:` link (e.g., `tel:+1234567890`) in your browser, email client, or CRM will:
1. Open Linkus Linux (if not already open)
2. Fill in the phone number
3. Initiate the call automatically

### System Tray

- **Click tray icon**: Show/hide the main window
- **Badge count**: Shows number of unread notifications
- **Context menu**: Quick access to settings and options

##  Development

### Prerequisites

- Node.js 18+ and npm
- Git

### Setup

1. Clone the repository:

```bash
git clone https://github.com/aalonzolu/linkus-linux.git
cd linkus-linux
```

2. Install dependencies:

```bash
npm install
```

3. Run in development mode:

```bash
npm start
```

### Register Tel Protocol (Development)

```bash
npm run register:tel
```

This creates a desktop entry pointing to your development environment.

### Project Structure

```
linkus-linux/
├── app/
│   ├── config.js              # Configuration management
│   ├── assets/sounds/         # Notification sounds
│   ├── customNotifications/   # Custom toast notifications
│   ├── notifications/         # Notification service
│   └── tray/                  # System tray integration
├── build/icons/               # Application icons
├── scripts/                   # Build and utility scripts
├── .github/workflows/         # CI/CD workflows
├── main.js                    # Main process entry point
├── preload.js                 # Preload script for main window
├── setup.html                 # Server configuration UI
└── setupPreload.js            # Preload script for setup window
```

##  Building

### Build All Packages

```bash
npm run dist
```

### Build Specific Package

```bash
npm run dist:deb      # Debian/Ubuntu package
npm run dist:rpm      # Fedora/RHEL package
npm run dist:AppImage # Universal AppImage
```

### Build with Script

```bash
npm run build:deb     # Uses scripts/build-deb.sh
```

Packages will be available in the `dist/` directory.

##  Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute

1. **Report Bugs** - See [Bug Reports](#-bug-reports) section below
2. **Suggest Features** - Open an [issue](https://github.com/aalonzolu/linkus-linux/issues/new) with your ideas
3. **Submit Pull Requests** - Fix bugs or implement features
4. **Improve Documentation** - Help make docs clearer
5. **Translate** - Add support for more languages
6. **Test** - Try the app on different distributions and report issues

### Development Workflow

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/linkus-linux.git
   cd linkus-linux
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/bug-description
   ```

3. **Make your changes**
   - Follow the existing code style
   - Test your changes thoroughly
   - Update documentation if needed

4. **Commit using conventional commits**
   ```bash
   git commit -m "feat: add support for custom ring tones"
   git commit -m "fix: resolve tray icon not showing on Wayland"
   git commit -m "docs: update installation instructions"
   ```

   **Commit types:**
   - `feat:` New features
   - `fix:` Bug fixes
   - `docs:` Documentation changes
   - `style:` Code style changes (formatting, etc.)
   - `refactor:` Code refactoring
   - `test:` Adding or updating tests
   - `chore:` Maintenance tasks

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/my-new-feature
   ```
   Then open a PR on GitHub with a clear description of your changes.

### Code Guidelines

- Use ES6+ JavaScript features
- Follow existing code formatting
- Add comments for complex logic
- Test on multiple distributions when possible
- Keep commits focused and atomic

### Need Help?

- Check existing [issues](https://github.com/aalonzolu/linkus-linux/issues) and [discussions](https://github.com/aalonzolu/linkus-linux/discussions)
- Join our community discussions
- Ask questions in your PR or issue

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 🐛 Bug Reports

Found a bug? Help us improve Linkus Linux!

### Before Reporting

1. **Check existing issues**: Search [open issues](https://github.com/aalonzolu/linkus-linux/issues) to avoid duplicates
2. **Try latest version**: Update to the latest release
3. **Test in development**: Try running from source to see if it's already fixed

### How to Report

[**Create a new issue**](https://github.com/aalonzolu/linkus-linux/issues/new) with the following information:

#### Required Information

1. **Clear title**: Describe the issue concisely
2. **Description**: What happened vs. what you expected
3. **Steps to reproduce**: Detailed steps to trigger the bug
4. **Environment**:
   - Linux distribution and version (e.g., Ubuntu 22.04)
   - Desktop environment (GNOME, KDE, XFCE, etc.)
   - Linkus Linux version
   - Installation method (.deb, .rpm, AppImage)

5. **Logs**: Run the app from terminal and include relevant output
   ```bash
   linkus-linux 2>&1 | tee linkus-debug.log
   ```

6. **Screenshots**: If applicable, add screenshots or screen recordings

#### Example Bug Report

```markdown
**Title**: System tray icon not showing on Wayland

**Description**: 
The system tray icon doesn't appear when running Linkus Linux on Wayland session.

**Steps to reproduce**:
1. Start Linkus Linux on Ubuntu 22.04 with Wayland
2. Look for tray icon in system tray
3. Icon is not visible

**Environment**:
- Distribution: Ubuntu 22.04 LTS
- Desktop: GNOME 42 (Wayland)
- Version: Linkus Linux 0.1.0
- Installation: .deb package

**Logs**:
```
[ApplicationTray] Error creating tray: ...
```

**Screenshots**:
[Attach screenshot]
```

### Bug Priority Labels

- `critical` - App crashes or data loss
- `high` - Major feature broken
- `medium` - Feature partially broken
- `low` - Minor inconvenience
- `enhancement` - Feature request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

##  Disclaimer

**This project is not affiliated with, endorsed by, or in any way officially connected with Yeastar.**

Linkus Linux is an independent, community-driven project created to address the need for a native Linux client for Yeastar's P-Series PBX system. All product names, logos, and brands are property of their respective owners.

---

<div align="center">

**Made with ❤️ by [@aalonzolu](https://github.com/aalonzolu)**

If you find this project useful, please consider giving it a ⭐ on [GitHub](https://github.com/aalonzolu/linkus-linux)!

</div>

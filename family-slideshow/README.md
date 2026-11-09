# Family Photos Slideshow 📺✨

A simple, smooth, TV-friendly family photo slideshow website designed for smart-TV browsers (Samsung, LG, Android TV, Fire TV) that streams photos directly from a public Google Drive folder and deploys on Vercel with zero frontend build dependencies.

---

## Features

- **TV-Remote Ready**: Full spatial navigation with arrow keys, OK/Select, Back, and standard media playback buttons.
- **Two Viewing Modes**:
  - **Choose an album**: Browse folders in your Google Drive as albums and play a specific collection.
  - **Shuffle all photos**: Stream a random mix of memories across all folders.
- **Cinema-Quality Transitions**: Seamless crossfades with gentle Ken Burns zoom effects and blurred backdrops with zero dark dips between images.
- **TV Controls & Settings**:
  - Adjustable time per photo (3s up to 1m)
  - Sleep timer that turns off playback (5m to 2h)
  - Sorting (chronological by date taken or random shuffle)
  - Fullscreen toggle & Screen Wake Lock support
- **Zero NPM Frontend Dependencies**: Pure vanilla HTML, CSS, and modern JavaScript compatible with older Smart TV browser engines.
- **Automatic HEIC Conversion**: Apple iPhone HEIC photos are automatically converted to JPEG by Google's thumbnail service.

---

## Step-by-Step Setup Guide

Follow this guide to get your slideshow running on your Smart TV in minutes.

### 1. Share Your Google Drive Folder
1. Open [Google Drive](https://drive.google.com).
2. Right-click your family photos folder and select **Share** > **Share**.
3. Under **General access**, change the setting to **"Anyone with the link"** and ensure the role is set to **"Viewer"**.
4. Click **Copy link**. The folder ID is the part of the URL between `/folders/` and any `?`:
   `https://drive.google.com/drive/folders/YOUR_FOLDER_ID`

---

### 2. Create a Free Google Drive API Key
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and click **New Project** (e.g. name it "Family Slideshow").
3. Navigate to **APIs & Services** > **Library**.
4. Search for **Google Drive API**, click it, and click **Enable**.
5. Go to **APIs & Services** > **Credentials**.
6. Click **+ Create Credentials** at the top and choose **API key**.
7. *(Recommended)* Click **Edit API key**, and under **API restrictions**, choose **Restrict key**, check **Google Drive API**, and click **Save**.
8. Copy your API key.

---

### 3. Push to GitHub
1. Create a new repository on [GitHub](https://github.com) (can be private or public).
2. In your local project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of family photo slideshow"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

---

### 4. Deploy to Vercel
1. Log in to [Vercel](https://vercel.com/) and click **Add New...** > **Project**.
2. Select your GitHub repository and click **Import**.
3. Keep the **Framework Preset** as **Other** (do NOT add a build command or output directory).
4. Expand **Environment Variables** and add:
   - `GOOGLE_API_KEY`: Paste your Google API Key from Step 2.
   - `DRIVE_FOLDER_ID`: (Optional) Paste your folder ID if different from the default (`15otliIkybVKJrKDPUTKKi3_2J7JPzlvk`).
5. Click **Deploy**.
   > *Note: If you add or modify environment variables after deploying, remember to go to **Deployments** > **Redeploy** so the changes take effect.*

---

### 5. Open on Your Smart TV
1. Launch the web browser on your TV (Samsung Internet on Tizen, LG webOS Browser, Android TV Chrome/Puffin).
2. Type in your Vercel deployment URL (e.g. `https://your-slideshow.vercel.app`).
3. Add the page to your TV browser's **Bookmarks** or **Home Screen** for quick one-click access.

---

## TV Remote Control Mapping

| Remote Button | Action on Menus / Albums | Action During Slideshow (Controls Hidden) | Action During Slideshow (Controls Visible) |
| :--- | :--- | :--- | :--- |
| **Arrow Left** / **Right** | Move focus to adjacent card / button | Previous photo / Next photo | Move focus between HUD buttons |
| **Arrow Up** / **Down** | Move focus up / down | Show controls (focus on Pause) | Move focus between HUD buttons |
| **OK / Enter / Select** | Open album / trigger selected action | Show controls (focus on Pause) | Press focused HUD button |
| **Back / Exit / Return** | Go back to previous screen | Exit slideshow to main menu | Hide controls overlay |
| **Play / Pause** | - | Toggle Play / Pause | Toggle Play / Pause |
| **Next / Fast Forward** | - | Jump to next photo | Jump to next photo |
| **Previous / Rewind** | - | Jump to previous photo | Jump to previous photo |
| **Spacebar** | - | Toggle Play / Pause | Toggle Play / Pause |

---

## Important Notes

- **Caching & New Photos**: Google Drive responses are cached at the Vercel edge for 10 minutes (`s-maxage=600, stale-while-revalidate=86400`) to keep the TV loading instantly and avoid Google Drive rate limits. Any newly added photos will automatically appear after 10 minutes (or immediately after a redeployment in Vercel).
- **HEIC Photos & Videos**: Google's thumbnail CDN automatically converts Apple HEIC photos into web-compatible JPEG images. Video files (`.mp4`, `.mov`, etc.) in the folder are automatically ignored so playback never stalls.
- **TV Auto-Off & Screen Savers**: The slideshow requests a **Screen Wake Lock** when running to keep your TV screen active. When the sleep timer ends or you exit the player, the wake lock is released so your TV can save energy or activate its screensaver.
- **Privacy & Security**: Anyone with your Vercel URL will be able to view the slideshow. Never share the public URL outside trusted family members. Your `GOOGLE_API_KEY` is completely secure on the Vercel backend and is never exposed to the browser.

---

## Running Locally

To test or run the project locally on your computer:

1. Clone or download the repository.
2. Create your local environment configuration:
   ```bash
   cp .env.example .env.local
   ```
3. Open `.env.local` and add your `GOOGLE_API_KEY`:
   ```env
   GOOGLE_API_KEY=AIzaSy...
   DRIVE_FOLDER_ID=15otliIkybVKJrKDPUTKKi3_2J7JPzlvk
   ```
4. Start the local server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Troubleshooting

| Error Message | Cause | How to Fix |
| :--- | :--- | :--- |
| **Missing GOOGLE_API_KEY environment variable** | `GOOGLE_API_KEY` was not configured in Vercel or `.env.local`. | Go to **Vercel** > your project > **Settings** > **Environment Variables**, add `GOOGLE_API_KEY`, and trigger a **Redeploy**. For local testing, add it to `.env.local`. |
| **API key not valid / Google Drive API error (400 or 403)** | API key is misspelled, restricted incorrectly, or the Drive API is disabled. | 1. Go to Google Cloud Console > **APIs & Services** > **Library** and verify **Google Drive API** is enabled.<br>2. In **Credentials**, check if API restrictions allow Google Drive API.<br>3. Check for billing or quota alerts. |
| **File not found / Google Drive error (404)** | The `DRIVE_FOLDER_ID` is invalid or the folder is private. | 1. In Google Drive, check the folder's share settings: change from "Restricted" to **"Anyone with the link: Viewer"**.<br>2. Verify the `DRIVE_FOLDER_ID` matches your shared link. |
| **No photos found in the Google Drive folder** | Folder or its subfolders do not contain any supported image formats. | Add photos (`.jpg`, `.jpeg`, `.png`, `.heic`) to the folder or its subfolders. |
| **Slideshow feels laggy on older TV** | Heavy blur backdrop effects may slow down low-spec TV hardware. | Open **Settings** on the home screen and toggle **Blurred background** to **Off**. |


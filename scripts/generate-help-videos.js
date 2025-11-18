const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configuration
const VIDEO_DIR = path.join(__dirname, '../public/help-videos');
const AUTH_FILE = path.join(__dirname, '../playwright/.auth/superadmin.json');
const BASE_URL = process.env.PLAYWRIGHT_FRONTEND_URL || 'http://localhost:4000';

// Ensure video directory exists
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

async function injectCursor(page) {
  await page.addStyleTag({
    content: `
      .cursor-dot {
        width: 20px;
        height: 20px;
        background: rgba(255, 0, 0, 0.5);
        border: 2px solid red;
        border-radius: 50%;
        position: fixed;
        z-index: 99999;
        pointer-events: none;
        transition: left 0.1s, top 0.1s;
        transform: translate(-50%, -50%);
      }
      .cursor-arrow {
        position: fixed;
        z-index: 99999;
        pointer-events: none;
        font-size: 40px;
        color: red;
        font-weight: bold;
        text-shadow: 2px 2px 0px white;
        animation: bounce 1s infinite;
      }
      @keyframes bounce {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(10px); }
      }
    `
  });

  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.className = 'cursor-dot';
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });
  });
}

async function showArrow(page, selector, text = 'Click Here') {
  const box = await page.locator(selector).boundingBox();
  if (!box) return;

  await page.evaluate(({ box, text }) => {
    const arrow = document.createElement('div');
    arrow.className = 'cursor-arrow';
    arrow.innerHTML = '← ' + text;
    // Position to the right of the element
    arrow.style.left = (box.x + box.width + 10) + 'px';
    arrow.style.top = (box.y + box.height / 2 - 20) + 'px';
    arrow.id = 'temp-arrow';
    document.body.appendChild(arrow);
  }, { box, text });

  await page.waitForTimeout(1500); // Show arrow for 1.5s

  await page.evaluate(() => {
    const arrow = document.getElementById('temp-arrow');
    if (arrow) arrow.remove();
  });
}

async function recordVideo(name, actions) {
  console.log(`Recording ${name}...`);
  const browser = await chromium.launch({
    headless: false, // Must be false to see the rendering properly sometimes, but headless works too.
    slowMo: 100, // Slow down actions
  });

  const context = await browser.newContext({
    storageState: AUTH_FILE,
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();
  await injectCursor(page);

  try {
    await actions(page);
  } catch (e) {
    console.error(`Error recording ${name}:`, e);
  }

  await context.close(); // Saves the video
  await browser.close();

  // Rename the video file
  const videoFiles = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm') && !f.includes(name));
  // The newest file is likely our video (since we just closed context)
  // Actually, context.close() ensures it's saved.
  // Playwright generates random names. We need to find the one created just now.
  // A better way is to get the path from the page object before closing, but page.video().path() is async.
  
  // Wait a moment for file system
  await new Promise(r => setTimeout(r, 1000));
  
  // Find the latest webm file
  const files = fs.readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith('.webm'))
    .map(f => ({ name: f, time: fs.statSync(path.join(VIDEO_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (files.length > 0) {
    const latestVideo = files[0].name;
    const newPath = path.join(VIDEO_DIR, `${name}.webm`);
    
    // Delete existing if any
    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
    
    fs.renameSync(path.join(VIDEO_DIR, latestVideo), newPath);
    console.log(`Saved video to ${newPath}`);
  }
}

// --- Scenarios ---

async function scenarioAccounts(page) {
  await page.goto(`${BASE_URL}/Accounts`);
  await page.waitForLoadState('networkidle');
  
  // Point to "Add Account"
  await showArrow(page, 'button:has-text("Add Account")', 'Create New');
  await page.click('button:has-text("Add Account")');
  
  // Fill form
  await page.fill('input[name="name"]', 'Demo Corp');
  await page.fill('input[name="website"]', 'https://demo.com');
  
  // Point to Save
  await showArrow(page, 'button[type="submit"]', 'Save It');
  // Don't actually submit to avoid polluting DB too much, or submit and delete.
  // For demo, we can just close.
  await page.click('button:has-text("Cancel")');
}

// --- Main ---

(async () => {
  await recordVideo('accounts-demo', scenarioAccounts);
})();

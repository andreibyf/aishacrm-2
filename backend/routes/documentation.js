/**
 * Documentation Routes
 * Serves the Aisha CRM User Guide as a generated PDF from markdown.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';

export default function createDocumentationRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/documentation - List available documentation
  router.get('/', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          documents: [
            { name: 'User Guide', path: '/api/documentation/user-guide.pdf', format: 'pdf' },
            { name: 'API Reference', path: '/api-docs', format: 'html' }
          ]
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/documentation/user-guide.pdf - Generate PDF from markdown file
  router.get('/user-guide.pdf', async (req, res) => {
    let browser;
    try {
      // Resolve path to docs/user-guide.md relative to backend folder
      const mdPath = path.resolve(process.cwd(), 'docs', 'user-guide.md');
      if (!fs.existsSync(mdPath)) {
        return res.status(404).json({
          status: 'error',
          message: `User Guide markdown not found at ${mdPath}`,
        });
      }

      const markdown = await fs.promises.readFile(mdPath, 'utf-8');

      // Build an HTML shell that converts markdown → HTML via marked in the page context
      const htmlContent = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>Aisha CRM - User Guide</title>
        <style>
          /* Basic readable print styles */
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 32px; }
          h1, h2, h3, h4 { color: #1f2937; }
          h1 { font-size: 28px; border-bottom: 3px solid #9333ea; padding-bottom: 8px; }
          h2 { font-size: 22px; margin-top: 20px; }
          h3 { font-size: 18px; margin-top: 16px; }
          p, li { font-size: 12.5px; line-height: 1.55; }
          code, pre { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
          pre { padding: 12px; overflow: auto; }
          ul { margin-left: 18px; }
          .header { text-align: center; margin-bottom: 24px; }
          .header small { color: #6b7280; }
          .footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #6b7280; font-size: 11px; text-align: center; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Aisha CRM - Comprehensive User Guide</h1>
          <small>Generated on ${new Date().toLocaleString()}</small>
        </div>
        <div id="content">Rendering…</div>
        <div class="footer">Aisha CRM — Documentation</div>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <script>
          try {
            const md = ${JSON.stringify(markdown)};
            // Configure marked for safe baseline rendering
            if (window.marked && typeof window.marked.parse === 'function') {
              const html = window.marked.parse(md);
              document.getElementById('content').innerHTML = html;
            } else {
              document.getElementById('content').textContent = md;
            }
          } catch (e) {
            document.getElementById('content').textContent = 'Failed to render guide: ' + (e?.message || e);
          }
        </script>
      </body>
      </html>`;

      // Use Puppeteer to render and export to PDF
      const puppeteer = await import('puppeteer');
      browser = await puppeteer.default.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
      });

      const out = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer.buffer ? Buffer.from(pdfBuffer.buffer) : pdfBuffer);
      // Send as raw binary with explicit headers and no transforms
      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Aisha_CRM_User_Guide.pdf"',
        'Content-Length': out.length,
        // Prevent intermediaries from transforming the payload (critical for binary integrity)
        'Cache-Control': 'no-store, no-transform',
        'Accept-Ranges': 'none',
      };
      res.writeHead(200, headers);
      return res.end(out);
    } catch (err) {
      console.error('[documentation] Failed to generate user-guide.pdf:', err?.message || err);
      return res.status(500).json({ status: 'error', message: err?.message || 'Failed to generate PDF' });
    } finally {
      if (browser) {
        try { await browser.close(); } catch { /* no-op */ }
      }
    }
  });

  return router;
}

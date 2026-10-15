# Rapiprint Design Works

This repository is a converted Simple House template rewritten to represent Rapiprint Design Works. The site is a small Jekyll-style static site composed of HTML and CSS.

Live site description: rapiprintdesignworks.com

## Asset organization

The site is currently using a static-file layout, so the gallery image files are still stored at the repo root to preserve the live site references. This branch is the cleanup pass: we are documenting the intended organization and preparing the assets directory for normalized gallery media.

Planned structure:
- assets/logo.png
- assets/background.jpg
- assets/style.css
- assets/images/  (normalized gallery assets after migration)

Files updated:
- index.html — new homepage content: hero, services, workflow, gallery placeholders, CTAs
- about.html — studio copy and working principles
- services.html — detailed services and process
- portfolio.html — gallery placeholders / carousel
- contact.html — contact details and intake form
- _includes/header.html — header updated to use Rapiprint logo
- assets/style.css — full CSS rewrite with Rapiprint branding
- assets/Gallery — housekeeping note to clarify the asset organization

Next steps:
- Move gallery media into assets/images/ with URL-safe filenames and update page references.
- Remove legacy root-level gallery files after the new paths have been verified.
- Replace the intake form action with a working backend or form service.

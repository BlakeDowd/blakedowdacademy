# Clear Turbopack Cache Instructions

## After fixing lab()/oklch() color function errors:

1. **Stop the dev server** (Ctrl+C in terminal)

2. **Clear Next.js cache:**
   ```bash
   rm -rf .next
   ```
   Or on Windows:
   ```powershell
   Remove-Item -Recurse -Force .next
   ```

3. **Clear Turbopack cache:**
   ```bash
   rm -rf .turbo
   ```
   Or on Windows:
   ```powershell
   Remove-Item -Recurse -Force .turbo
   ```

4. **Restart the dev server:**
   ```bash
   npm run dev
   ```

## What was fixed:

- ✅ All Tailwind color classes (orange-, green-, blue-, red-) replaced with HEX/rgba inline styles
- ✅ All gradients use standard `linear-gradient()` syntax with HEX colors
- ✅ Performance Rings use SVG stroke colors (HEX)
- ✅ XP Progress Bar uses `linear-gradient(to right, #FFA500, #FF8C00)`
- ✅ All glow/shadow effects use `rgba(255, 165, 0, 0.5)` format

The console error should be resolved after clearing the cache and restarting.


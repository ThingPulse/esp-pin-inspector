#!/usr/bin/env node

/**
 * Extracts pin pad areas from pinmap.svg and updates chip.json
 * Uses Puppeteer to get accurate bounding boxes of pin labels
 * 
 * Usage: node tools/extract-pin-areas.mjs <chip-folder> [padding]
 * Example: node tools/extract-pin-areas.mjs src/assets/chips/esp32-s3-mini-1 10
 * 
 * @param {string} chipFolder - Path to chip folder containing pinmap.svg and chip.json
 * @param {number} padding - Optional padding in pixels around the label (default: 5)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import puppeteer from 'puppeteer';

// Get bounding box of a text element using Puppeteer
async function getTextBoundingBox(svgContent, textContent) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Create a temporary SVG with the text element and get its bounding box
    // We'll inject a script to find the text element and get its bbox
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><style>body { margin: 0; }</style></head>
        <body>${svgContent}</body>
      </html>
    `);
    
    const bbox = await page.evaluate((searchText) => {
      // Find all text elements
      const texts = Array.from(document.querySelectorAll('text'));
      
      // Find the one that matches our search text
      const textElement = texts.find(el => {
        const content = el.textContent.trim();
        return content === searchText || content.match(new RegExp(`^${searchText}$`, 'i'));
      });
      
      if (!textElement) return null;
      
      // Get bounding box in SVG coordinates
      try {
        const bbox = textElement.getBBox();
        return {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        };
      } catch (e) {
        // Fallback: try to get computed bounding box
        const rect = textElement.getBoundingClientRect();
        const svg = textElement.ownerSVGElement;
        if (!svg) return null;
        
        const svgRect = svg.getBoundingClientRect();
        const point = svg.createSVGPoint();
        
        // Convert screen coordinates to SVG coordinates
        point.x = rect.left - svgRect.left;
        point.y = rect.top - svgRect.top;
        const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
        
        return {
          x: svgPoint.x,
          y: svgPoint.y,
          width: rect.width * (svg.viewBox.baseVal.width / svgRect.width),
          height: rect.height * (svg.viewBox.baseVal.height / svgRect.height)
        };
      }
    }, textContent);
    
    await browser.close();
    return bbox;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Get all pin label bounding boxes at once (more efficient)
async function getAllPinBoundingBoxes(svgContent, padding = 5) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Extract viewBox from SVG and set explicit dimensions
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    let svgWithDimensions = svgContent;
    let viewBoxValues = null;
    
    if (viewBoxMatch) {
      const viewBox = viewBoxMatch[1].split(/\s+/);
      const width = viewBox[2] || '100%';
      const height = viewBox[3] || '100%';
      viewBoxValues = { width: parseFloat(width), height: parseFloat(height) };
      // Replace width/height attributes to match viewBox exactly
      svgWithDimensions = svgContent
        .replace(/width="[^"]*"/, `width="${width}"`)
        .replace(/height="[^"]*"/, `height="${height}"`);
    }
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; }
            svg { display: block; }
          </style>
        </head>
        <body>${svgWithDimensions}</body>
      </html>
    `);
    
    // Wait for SVG to render
    await page.waitForSelector('svg');
    
    const pinBoxes = await page.evaluate((pad, viewBoxInfo) => {
      const results = [];
      const texts = Array.from(document.querySelectorAll('svg text'));
      const svg = texts[0]?.ownerSVGElement;
      if (!svg) return results;
      
      // Get SVG viewBox for coordinate conversion
      const viewBox = svg.viewBox.baseVal;
      const svgRect = svg.getBoundingClientRect();
      
      // If viewBox info is provided, use it to ensure correct scaling
      const expectedViewBoxWidth = viewBoxInfo?.width || viewBox.width;
      const expectedViewBoxHeight = viewBoxInfo?.height || viewBox.height;
      
      for (const textElement of texts) {
        const content = textElement.textContent.trim();
        const pinMatch = content.match(/^Pin\s+(\d+)$/i);
        
        if (!pinMatch) continue;
        
        try {
          // Get bounding box in element's local coordinate system
          const bbox = textElement.getBBox();
          
          // Transform bounding box corners to SVG viewBox coordinates
          const svgPoint = svg.createSVGPoint();
          const corners = [
            { x: bbox.x, y: bbox.y },
            { x: bbox.x + bbox.width, y: bbox.y },
            { x: bbox.x, y: bbox.y + bbox.height },
            { x: bbox.x + bbox.width, y: bbox.y + bbox.height }
          ];
          
          // Get the cumulative transform matrix from element to SVG root
          // getCTM() returns transform to SVG user coordinate system (viewBox)
          const ctm = textElement.getCTM();
          
          // Transform each corner to SVG viewBox coordinates
          const svgCorners = corners.map(corner => {
            svgPoint.x = corner.x;
            svgPoint.y = corner.y;
            if (ctm) {
              const transformed = svgPoint.matrixTransform(ctm);
              return transformed;
            }
            return svgPoint;
          });
          
          // Find bounding box of transformed corners
          const xs = svgCorners.map(p => p.x);
          const ys = svgCorners.map(p => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          
          // Apply padding
          const x = minX - pad;
          const y = minY - pad;
          const w = (maxX - minX) + (pad * 2);
          const h = (maxY - minY) + (pad * 2);
          
          results.push({
            number: pinMatch[1],
            x: Math.round(x),
            y: Math.round(y),
            w: Math.max(20, Math.round(w)),
            h: Math.max(20, Math.round(h))
          });
        } catch (e) {
          // Fallback: use getBoundingClientRect and convert to SVG viewBox coordinates
          try {
            const rect = textElement.getBoundingClientRect();
            
            // Convert screen coordinates to SVG viewBox coordinates
            const scaleX = viewBox.width / svgRect.width;
            const scaleY = viewBox.height / svgRect.height;
            
            // Get position relative to SVG element
            const offsetX = rect.left - svgRect.left;
            const offsetY = rect.top - svgRect.top;
            
            // Convert to viewBox coordinates
            const x = (offsetX * scaleX) - pad;
            const y = (offsetY * scaleY) - pad;
            const w = (rect.width * scaleX) + (pad * 2);
            const h = (rect.height * scaleY) + (pad * 2);
            
            results.push({
              number: pinMatch[1],
              x: Math.round(x),
              y: Math.round(y),
              w: Math.max(20, Math.round(w)),
              h: Math.max(20, Math.round(h))
            });
          } catch (e2) {
            console.warn(`Could not get bbox for ${content}:`, e2.message);
          }
        }
      }
      
      return results;
    }, padding, viewBoxValues);
    
    await browser.close();
    return pinBoxes;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Main function
async function extractPinAreas(chipFolder, padding = 5) {
  const svgPath = join(chipFolder, 'pinmap.svg');
  const jsonPath = join(chipFolder, 'chip.json');
  
  console.log(`Reading ${svgPath}...`);
  const svgContent = readFileSync(svgPath, 'utf-8');
  
  console.log(`Reading ${jsonPath}...`);
  const chipData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  
  console.log(`Using padding: ${padding}px`);
  console.log('Getting bounding boxes from SVG using Puppeteer...');
  
  // Get all pin bounding boxes
  const pinBoxes = await getAllPinBoundingBoxes(svgContent, padding);
  console.log(`Found ${pinBoxes.length} pin labels`);
  
  // Update chip.json with bounding boxes
  let updated = 0;
  for (const box of pinBoxes) {
    const pin = chipData.pins.find(p => p.number === box.number);
    
    if (!pin) {
      console.log(`  Warning: Pin ${box.number} not found in chip.json`);
      continue;
    }
    
    pin.area = {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h
    };
    
    // Update position to center of area
    pin.position = {
      x: Math.round(box.x + box.w / 2),
      y: Math.round(box.y + box.h / 2)
    };
    
    updated++;
    console.log(`  ✓ Pin ${box.number}: area(${pin.area.x}, ${pin.area.y}, ${pin.area.w}, ${pin.area.h})`);
  }
  
  // Write updated chip.json
  writeFileSync(jsonPath, JSON.stringify(chipData, null, 2) + '\n');
  console.log(`\n✓ Updated ${updated} pins in ${jsonPath}`);
}

// Main
const chipFolder = process.argv[2];
const padding = process.argv[3] ? parseFloat(process.argv[3]) : 5;

if (!chipFolder) {
  console.error('Usage: node tools/extract-pin-areas.mjs <chip-folder> [padding]');
  console.error('Example: node tools/extract-pin-areas.mjs src/assets/chips/esp32-s3-mini-1 10');
  console.error('  padding: Optional padding in pixels around the label (default: 5)');
  process.exit(1);
}

if (isNaN(padding) || padding < 0) {
  console.error('Error: padding must be a non-negative number');
  process.exit(1);
}

const fullPath = chipFolder.startsWith('/') 
  ? chipFolder 
  : join(process.cwd(), chipFolder);

extractPinAreas(fullPath, padding).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

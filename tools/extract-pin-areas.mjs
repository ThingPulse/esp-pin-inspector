#!/usr/bin/env node

/**
 * Extracts pin pad areas from pinmap.svg and updates chip.json
 * Creates bounding boxes around pin labels with optional padding
 * 
 * Usage: node tools/extract-pin-areas.mjs <chip-folder> [padding]
 * Example: node tools/extract-pin-areas.mjs src/assets/chips/esp32-s3-mini-1 10
 * 
 * @param {string} chipFolder - Path to chip folder containing pinmap.svg and chip.json
 * @param {number} padding - Optional padding in pixels around the label (default: 5)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Parse transform matrix: "matrix(a,b,c,d,e,f)" or "translate(x,y)" etc.
function parseTransform(transform) {
  if (!transform) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  
  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if (matrixMatch) {
    const [a, b, c, d, e, f] = matrixMatch[1].split(/[,\s]+/).map(Number);
    return { a, b, c, d, e, f };
  }
  
  const translateMatch = transform.match(/translate\(([^)]+)\)/);
  if (translateMatch) {
    const [x, y] = translateMatch[1].split(/[,\s]+/).map(Number);
    return { a: 1, b: 0, c: 0, d: 1, e: x || 0, f: y || 0 };
  }
  
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

// Multiply two transform matrices
function multiplyTransforms(t1, t2) {
  return {
    a: t1.a * t2.a + t1.c * t2.b,
    b: t1.b * t2.a + t1.d * t2.b,
    c: t1.a * t2.c + t1.c * t2.d,
    d: t1.b * t2.c + t1.d * t2.d,
    e: t1.a * t2.e + t1.c * t2.f + t1.e,
    f: t1.b * t2.e + t1.d * t2.f + t1.f
  };
}

// Apply transform to a point
function applyTransform(x, y, transform) {
  return {
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f
  };
}

// Extract bounding box from path data
function getPathBounds(pathData) {
  const coords = [];
  // Match M/L commands with coordinates
  const commands = pathData.match(/[ML][\d.\-]+(?:[,\s]+[\d.\-]+)*/g) || [];
  
  for (const cmd of commands) {
    const parts = cmd.substring(1).trim().split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
    if (parts.length >= 2) {
      coords.push({ x: parts[0], y: parts[1] });
    }
  }
  
  if (coords.length === 0) return null;
  
  const xs = coords.map(p => p.x);
  const ys = coords.map(p => p.y);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

// Detect if transform contains rotation (90 or -90 degrees)
function isRotated(transform) {
  // Check for 90/-90 degree rotation pattern
  // matrix(0,-s,s,0,...) or matrix(0,s,-s,0,...) = 90° rotation with scale s
  // After combining transforms, we check if the pattern matches
  const absA = Math.abs(transform.a);
  const absB = Math.abs(transform.b);
  const absC = Math.abs(transform.c);
  const absD = Math.abs(transform.d);
  
  // Pattern 1: a≈0, d≈0, |b|≈|c| (90° rotation, possibly scaled)
  const pattern1 = absA < absB * 0.1 && absD < absC * 0.1 && 
                   Math.abs(absB - absC) < Math.max(absB, absC) * 0.2;
  
  // Pattern 2: b≈0, c≈0, |a|≈|d| (0° or 180° rotation - not 90°)
  // But if a and d are both small, it might be 90°
  const pattern2 = absB < absA * 0.1 && absC < absD * 0.1 && 
                   (absA < 0.1 || absD < 0.1);
  
  // Also check if it's close to a 90° rotation matrix
  // For 90°: a*d - b*c should be positive (determinant = scale^2)
  const det = transform.a * transform.d - transform.b * transform.c;
  const scaleSq = absB * absB + absC * absC; // Approximate scale squared for rotated case
  
  return pattern1 || (pattern2 && Math.abs(det - scaleSq) < scaleSq * 0.2);
}

// Find all pin labels and their transformed positions with text size info
function findPinLabels(svgContent) {
  const pinLabels = [];
  
  // Find all text elements with "Pin <number>"
  const textPattern = /<text([^>]*)>([^<]+)<\/text>/g;
  let textMatch;
  
  while ((textMatch = textPattern.exec(svgContent)) !== null) {
    const textAttrs = textMatch[1];
    const textContent = textMatch[2].trim();
    const pinMatch = textContent.match(/^Pin\s+(\d+)$/i);
    
    if (pinMatch) {
      const xMatch = textAttrs.match(/x="([^"]+)"/);
      const yMatch = textAttrs.match(/y="([^"]+)"/);
      const fontSizeMatch = textAttrs.match(/font-size:([^;]+)/);
      const textAnchorMatch = textAttrs.match(/text-anchor="([^"]+)"/);
      const dominantBaselineMatch = textAttrs.match(/dominant-baseline="([^"]+)"/);
      
      if (xMatch && yMatch) {
        const x = parseFloat(xMatch[1].replace('px', ''));
        const y = parseFloat(yMatch[1].replace('px', ''));
        const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1].replace('px', '')) : 20;
        const textAnchor = textAnchorMatch ? textAnchorMatch[1] : 'start'; // default is 'start'
        const dominantBaseline = dominantBaselineMatch ? dominantBaselineMatch[1] : 'baseline'; // default is 'baseline'
        
        // Estimate text width (more accurate: ~0.55-0.65 * fontSize per character for "Pin X")
        // "Pin 1" = 5 chars, "Pin 10" = 6 chars, "Pin 100" = 7 chars
        // Use a more accurate per-character width based on typical font metrics
        // For monospace-like fonts, use 0.6, but account for variable width
        const charWidth = fontSize * 0.65; // Slightly wider for better coverage
        const textWidth = textContent.length * charWidth;
        const textHeight = fontSize * 1.0; // Use fontSize directly for height (baseline to top)
        
        // Find all parent <g> elements before this text using a stack
        const beforeText = svgContent.substring(0, textMatch.index);
        const stack = [];
        let pos = 0;
        
        while (pos < beforeText.length) {
          const gOpen = beforeText.indexOf('<g', pos);
          const gClose = beforeText.indexOf('</g>', pos);
          
          if (gOpen === -1 && gClose === -1) break;
          
          if (gClose !== -1 && (gOpen === -1 || gClose < gOpen)) {
            // Close tag
            stack.pop();
            pos = gClose + 4;
          } else if (gOpen !== -1) {
            // Open tag - extract attributes
            const tagEnd = beforeText.indexOf('>', gOpen);
            if (tagEnd !== -1) {
              const attrs = beforeText.substring(gOpen + 2, tagEnd);
              const tMatch = attrs.match(/transform="([^"]+)"/);
              if (tMatch) {
                stack.push(parseTransform(tMatch[1]));
              } else {
                stack.push(null); // Track group even without transform
              }
              pos = tagEnd + 1;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        
        // Apply transforms in order (innermost first)
        let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        for (const t of stack) {
          if (t) {
            transform = multiplyTransforms(t, transform);
          }
        }
        
        // Check if text is rotated
        const rotated = isRotated(transform);
        
        // Transform text dimensions
        const scaleX = Math.sqrt(transform.a * transform.a + transform.c * transform.c);
        const scaleY = Math.sqrt(transform.b * transform.b + transform.d * transform.d);
        
        // Calculate actual text dimensions
        let actualWidth = textWidth * scaleX;
        let actualHeight = textHeight * scaleY;
        
        // Adjust for text anchor in local coordinates
        // For SVG text, (x,y) is the anchor point, so we need to offset to get the center
        let anchorX = 0;
        let anchorY = 0;
        
        // Text anchor affects horizontal positioning
        if (textAnchor === 'middle') {
          anchorX = -actualWidth / 2;
        } else if (textAnchor === 'end') {
          anchorX = -actualWidth;
        }
        // 'start' (default) means anchorX = 0
        
        // Dominant baseline affects vertical positioning
        // For baseline, y is at the text baseline (bottom of most characters)
        // We want the center of the text box
        if (dominantBaseline === 'middle' || dominantBaseline === 'central') {
          anchorY = -actualHeight / 2;
        } else if (dominantBaseline === 'hanging') {
          anchorY = -actualHeight * 0.2; // Hanging baseline is near top
        } else {
          // 'baseline' (default) - adjust to center
          // For most fonts, the baseline is typically at about 0.75-0.8 * fontSize from the top
          // The center of the text is approximately at 0.4 * fontSize from the baseline
          // Since we're using fontSize directly for textHeight, adjust accordingly
          anchorY = -actualHeight * 0.5; // Center from baseline
        }
        
        // Apply anchor offset in local coordinates, then transform
        const localX = x + anchorX;
        const localY = y + anchorY;
        const screenPos = applyTransform(localX, localY, transform);
        
        let finalX = screenPos.x;
        let finalY = screenPos.y;
        
        pinLabels.push({
          number: pinMatch[1],
          x: finalX,
          y: finalY,
          textWidth: actualWidth,
          textHeight: actualHeight,
          rotated: rotated
        });
      }
    }
  }
  
  return pinLabels;
}

// Find path/rect elements and their bounding boxes
function findShapes(svgContent) {
  const shapes = [];
  
  // Find all paths
  const pathPattern = /<path([^>]*)d="([^"]+)"([^>]*)>/g;
  let pathMatch;
  
  while ((pathMatch = pathPattern.exec(svgContent)) !== null) {
    const beforePath = svgContent.substring(0, pathMatch.index);
    const pathData = pathMatch[2];
    const bounds = getPathBounds(pathData);
    
    if (bounds) {
      // Find parent transforms using stack
      const stack = [];
      let pos = 0;
      while (pos < beforePath.length) {
        const gOpen = beforePath.indexOf('<g', pos);
        const gClose = beforePath.indexOf('</g>', pos);
        
        if (gOpen === -1 && gClose === -1) break;
        
        if (gClose !== -1 && (gOpen === -1 || gClose < gOpen)) {
          stack.pop();
          pos = gClose + 4;
        } else if (gOpen !== -1) {
          const tagEnd = beforePath.indexOf('>', gOpen);
          if (tagEnd !== -1) {
            const attrs = beforePath.substring(gOpen + 2, tagEnd);
            const tMatch = attrs.match(/transform="([^"]+)"/);
            if (tMatch) {
              stack.push(parseTransform(tMatch[1]));
            } else {
              stack.push(null);
            }
            pos = tagEnd + 1;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      for (const t of stack) {
        if (t) {
          transform = multiplyTransforms(t, transform);
        }
      }
      
      // Transform bounds corners
      const corners = [
        applyTransform(bounds.minX, bounds.minY, transform),
        applyTransform(bounds.maxX, bounds.minY, transform),
        applyTransform(bounds.minX, bounds.maxY, transform),
        applyTransform(bounds.maxX, bounds.maxY, transform)
      ];
      
      const boxMinX = Math.min(...corners.map(c => c.x));
      const boxMaxX = Math.max(...corners.map(c => c.x));
      const boxMinY = Math.min(...corners.map(c => c.y));
      const boxMaxY = Math.max(...corners.map(c => c.y));
      
      shapes.push({
        x: boxMinX,
        y: boxMinY,
        w: boxMaxX - boxMinX,
        h: boxMaxY - boxMinY
      });
    }
  }
  
  // Find all rects
  const rectPattern = /<rect([^>]*)>/g;
  let rectMatch;
  
  while ((rectMatch = rectPattern.exec(svgContent)) !== null) {
    const beforeRect = svgContent.substring(0, rectMatch.index);
    const rectAttrs = rectMatch[1];
    
    const xMatch = rectAttrs.match(/x="([^"]+)"/);
    const yMatch = rectAttrs.match(/y="([^"]+)"/);
    const wMatch = rectAttrs.match(/width="([^"]+)"/);
    const hMatch = rectAttrs.match(/height="([^"]+)"/);
    
    if (xMatch && yMatch && wMatch && hMatch) {
      const x = parseFloat(xMatch[1].replace('px', ''));
      const y = parseFloat(yMatch[1].replace('px', ''));
      const w = parseFloat(wMatch[1].replace('px', ''));
      const h = parseFloat(hMatch[1].replace('px', ''));
      
      // Find parent transforms using stack
      const stack = [];
      let pos = 0;
      while (pos < beforeRect.length) {
        const gOpen = beforeRect.indexOf('<g', pos);
        const gClose = beforeRect.indexOf('</g>', pos);
        
        if (gOpen === -1 && gClose === -1) break;
        
        if (gClose !== -1 && (gOpen === -1 || gClose < gOpen)) {
          stack.pop();
          pos = gClose + 4;
        } else if (gOpen !== -1) {
          const tagEnd = beforeRect.indexOf('>', gOpen);
          if (tagEnd !== -1) {
            const attrs = beforeRect.substring(gOpen + 2, tagEnd);
            const tMatch = attrs.match(/transform="([^"]+)"/);
            if (tMatch) {
              stack.push(parseTransform(tMatch[1]));
            } else {
              stack.push(null);
            }
            pos = tagEnd + 1;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      
      let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      for (const t of stack) {
        if (t) {
          transform = multiplyTransforms(t, transform);
        }
      }
      
      // Transform rect corners
      const corners = [
        applyTransform(x, y, transform),
        applyTransform(x + w, y, transform),
        applyTransform(x, y + h, transform),
        applyTransform(x + w, y + h, transform)
      ];
      
      const boxMinX = Math.min(...corners.map(c => c.x));
      const boxMaxX = Math.max(...corners.map(c => c.x));
      const boxMinY = Math.min(...corners.map(c => c.y));
      const boxMaxY = Math.max(...corners.map(c => c.y));
      
      shapes.push({
        x: boxMinX,
        y: boxMinY,
        w: boxMaxX - boxMinX,
        h: boxMaxY - boxMinY
      });
    }
  }
  
  return shapes;
}

// Calculate bounding box around a pin label with padding
function calculateLabelBox(pinLabel, padding = 5) {
  // Calculate bounding box centered on the label
  const halfWidth = pinLabel.textWidth / 2;
  const halfHeight = pinLabel.textHeight / 2;
  
  let w, h;
  
  if (pinLabel.rotated) {
    // For rotated text (90 degrees), the text extends vertically
    // So the box should be taller than wide to match the text orientation
    // Swap: use textHeight for width, textWidth for height
    w = pinLabel.textHeight + (padding * 2);
    h = pinLabel.textWidth + (padding * 2);
  } else {
    // Normal horizontal text extends horizontally
    // Box should be wider than tall
    w = pinLabel.textWidth + (padding * 2);
    h = pinLabel.textHeight + (padding * 2);
  }
  
  const x = pinLabel.x - w / 2;
  const y = pinLabel.y - h / 2;
  
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(20, Math.round(w)), // Minimum width of 20px
    h: Math.max(20, Math.round(h))  // Minimum height of 20px
  };
}

// Main function
function extractPinAreas(chipFolder, padding = 5) {
  const svgPath = join(chipFolder, 'pinmap.svg');
  const jsonPath = join(chipFolder, 'chip.json');
  
  console.log(`Reading ${svgPath}...`);
  const svgContent = readFileSync(svgPath, 'utf-8');
  
  console.log(`Reading ${jsonPath}...`);
  const chipData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  
  console.log(`Using padding: ${padding}px`);
  
  // Find all pin labels
  console.log('Finding pin labels...');
  const pinLabels = findPinLabels(svgContent);
  console.log(`Found ${pinLabels.length} pin labels`);
  
  // Calculate bounding boxes around labels
  let updated = 0;
  for (const pinLabel of pinLabels) {
    const pinNumber = pinLabel.number;
    const pin = chipData.pins.find(p => p.number === pinNumber);
    
    if (!pin) {
      console.log(`  Warning: Pin ${pinNumber} not found in chip.json`);
      continue;
    }
    
    const box = calculateLabelBox(pinLabel, padding);
    
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
      console.log(`  ✓ Pin ${pinNumber}: area(${pin.area.x}, ${pin.area.y}, ${pin.area.w}, ${pin.area.h})`);
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

try {
  extractPinAreas(fullPath, padding);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}

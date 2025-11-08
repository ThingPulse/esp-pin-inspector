#!/usr/bin/env node

/**
 * Extracts vector graphics from a PDF page and saves them as SVG files
 * Uses pdfjs-dist to parse PDF content streams and extract vector paths
 * 
 * Usage: node tools/extract-pdf-vectors.mjs <pdf-path> <page-number> [output-dir] [output-filename]
 * Example: node tools/extract-pdf-vectors.mjs src/assets/chips/esp32-c6-mini-1/datasheet.pdf 10 src/assets/chips/esp32-c6-mini-1 pinmap.svg
 * 
 * @param {string} pdfPath - Path to the PDF file
 * @param {number} pageNumber - Page number to extract (1-based)
 * @param {string} outputDir - Optional output directory (default: same as PDF)
 * @param {string} outputFilename - Optional output filename (default: <pdf-name>-page<number>.svg)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// PDF.js (use legacy build in Node)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

class SVGPathBuilder {
  constructor() {
    this.paths = [];
    this.currentPath = '';
    this.currentX = 0;
    this.currentY = 0;
    this.transform = [1, 0, 0, 1, 0, 0];
    this.fillColor = 'none';
    this.strokeColor = '#000000';
    this.strokeWidth = 1;
  }
  
  moveTo(x, y) {
    const [tx, ty] = this.transformPoint(x, y);
    this.currentPath += `M ${tx} ${ty} `;
    this.currentX = tx;
    this.currentY = ty;
  }
  
  lineTo(x, y) {
    const [tx, ty] = this.transformPoint(x, y);
    this.currentPath += `L ${tx} ${ty} `;
    this.currentX = tx;
    this.currentY = ty;
  }
  
  curveTo(x1, y1, x2, y2, x3, y3) {
    const [tx1, ty1] = this.transformPoint(x1, y1);
    const [tx2, ty2] = this.transformPoint(x2, y2);
    const [tx3, ty3] = this.transformPoint(x3, y3);
    this.currentPath += `C ${tx1} ${ty1} ${tx2} ${ty2} ${tx3} ${ty3} `;
    this.currentX = tx3;
    this.currentY = ty3;
  }
  
  closePath() {
    this.currentPath += 'Z ';
  }
  
  setTransform(a, b, c, d, e, f) {
    this.transform = [a, b, c, d, e, f];
  }
  
  setFillColor(color) {
    this.fillColor = color;
  }
  
  setStrokeColor(color) {
    this.strokeColor = color;
  }
  
  setStrokeWidth(width) {
    this.strokeWidth = width;
  }
  
  transformPoint(x, y) {
    const [a, b, c, d, e, f] = this.transform;
    return [
      a * x + c * y + e,
      b * x + d * y + f
    ];
  }
  
  finishPath() {
    if (this.currentPath.trim()) {
      this.paths.push({
        d: this.currentPath.trim(),
        fill: this.fillColor,
        stroke: this.strokeColor,
        'stroke-width': this.strokeWidth
      });
      this.currentPath = '';
    }
  }
  
  toSVG(width, height) {
    this.finishPath();
    
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
`;
    
    for (const path of this.paths) {
      const attrs = Object.entries(path)
        .filter(([k, v]) => v !== 'none' && v !== 0)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      svg += `  <path ${attrs}/>\n`;
    }
    
    svg += '</svg>';
    return svg;
  }
}

async function extractVectorGraphics(pdfPath, pageNumber, outputDir = null, outputFilename = null) {
  try {
    // Read PDF file and convert Buffer to Uint8Array
    const pdfBuffer = readFileSync(pdfPath);
    const pdfBytes = new Uint8Array(pdfBuffer);
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDocument = await loadingTask.promise;
    
    // Check page number
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      throw new Error(`Page number ${pageNumber} is out of range (1-${pdfDocument.numPages})`);
    }
    
    // Get the page
    const page = await pdfDocument.getPage(pageNumber - 1);
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Get page operators (content stream)
    const operatorList = await page.getOperatorList();
    
    // Build SVG from operators
    const pathBuilder = new SVGPathBuilder();
    
    // Process operators
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const op = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];
      
      try {
        // Handle constructPath - this contains the actual path data
        if (op === pdfjsLib.OPS.constructPath) {
          if (args && args.length > 0) {
            // args[0] contains the path data
            const pathData = args[0];
            
            // constructPath structure: [count, operators, coordinates]
            // args[0] = number of path segments
            // args[1] = nested array containing Float32Array of operator codes
            // args[2] = Float32Array of coordinates
            if (args.length >= 3) {
              const opCount = typeof pathData === 'number' ? pathData : args[0];
              const operators = args[1];
              const coordinates = args[2];
              
              // Extract operator codes from nested array
              // The structure appears to be: operators array contains Float32Array with interleaved [op, x, y, op, x, y, ...]
              // OR: operators contains op codes, coordinates contains x,y pairs
              let opCodes = [];
              if (Array.isArray(operators)) {
                for (const opItem of operators) {
                  if (opItem instanceof Float32Array) {
                    opCodes = Array.from(opItem);
                    break;
                  } else if (Array.isArray(opItem) && opItem.length > 0) {
                    if (opItem[0] instanceof Float32Array) {
                      opCodes = Array.from(opItem[0]);
                      break;
                    } else if (Array.isArray(opItem[0])) {
                      opCodes = Array.from(opItem[0]);
                      break;
                    }
                  }
                }
              }
              
              // If opCodes looks like coordinates (contains negative or large numbers), 
              // it might be interleaved [op, x, y, op, x, y, ...] format
              if (opCodes.length > 0 && coordinates && coordinates.length > 0) {
                // Try interleaved format first: [op, x, y, op, x, y, ...]
                // opCodes[0]=0 might mean moveTo, opCodes[3]=1 might mean lineTo
                if (opCodes.length >= 3 && (opCodes.some(v => v < 0 || v > 100) || opCodes[0] < 20)) {
                  // Interleaved format: opCodes contains [op, x, y, op, x, y, ...]
                  for (let j = 0; j < opCodes.length; j += 3) {
                    if (j + 2 >= opCodes.length) break;
                    const pathOp = Math.round(opCodes[j]);
                    const x = opCodes[j + 1];
                    const y = opCodes[j + 2];
                    
                    // Map numeric codes: 0 = moveTo, 1 = lineTo (might be different encoding)
                    if (pathOp === 0 || pathOp === pdfjsLib.OPS.moveTo) {
                      pathBuilder.moveTo(x, y);
                    } else if (pathOp === 1 || pathOp === pdfjsLib.OPS.lineTo) {
                      pathBuilder.lineTo(x, y);
                    } else if (pathOp === pdfjsLib.OPS.closePath) {
                      pathBuilder.closePath();
                    }
                  }
                } else {
                  // Separate format: opCodes has operators, coordinates has x,y pairs
                  let coordIndex = 0;
                  for (let j = 0; j < opCodes.length && coordIndex < coordinates.length; j++) {
                    const pathOp = Math.round(opCodes[j]);
                    
                    if (pathOp === pdfjsLib.OPS.moveTo && coordIndex + 1 < coordinates.length) {
                      pathBuilder.moveTo(coordinates[coordIndex], coordinates[coordIndex + 1]);
                      coordIndex += 2;
                    } else if (pathOp === pdfjsLib.OPS.lineTo && coordIndex + 1 < coordinates.length) {
                      pathBuilder.lineTo(coordinates[coordIndex], coordinates[coordIndex + 1]);
                      coordIndex += 2;
                    } else if (pathOp === pdfjsLib.OPS.curveTo && coordIndex + 5 < coordinates.length) {
                      pathBuilder.curveTo(
                        coordinates[coordIndex], coordinates[coordIndex + 1],
                        coordinates[coordIndex + 2], coordinates[coordIndex + 3],
                        coordinates[coordIndex + 4], coordinates[coordIndex + 5]
                      );
                      coordIndex += 6;
                    } else if (pathOp === pdfjsLib.OPS.closePath) {
                      pathBuilder.closePath();
                    }
                  }
                }
                
                // Finish the path after constructPath
                pathBuilder.finishPath();
              }
              continue;
            }
            
            // Try different possible structures (fallback)
            if (Array.isArray(pathData)) {
              // Structure: [op1, args1, op2, args2, ...]
              for (let j = 0; j < pathData.length; j += 2) {
                if (j + 1 >= pathData.length) break;
                const pathOp = pathData[j];
                const pathArgs = pathData[j + 1];
                
                if (pathOp === pdfjsLib.OPS.moveTo && Array.isArray(pathArgs) && pathArgs.length >= 2) {
                  pathBuilder.moveTo(pathArgs[0], pathArgs[1]);
                } else if (pathOp === pdfjsLib.OPS.lineTo && Array.isArray(pathArgs) && pathArgs.length >= 2) {
                  pathBuilder.lineTo(pathArgs[0], pathArgs[1]);
                } else if (pathOp === pdfjsLib.OPS.curveTo && Array.isArray(pathArgs) && pathArgs.length >= 6) {
                  pathBuilder.curveTo(pathArgs[0], pathArgs[1], pathArgs[2], pathArgs[3], pathArgs[4], pathArgs[5]);
                } else if (pathOp === pdfjsLib.OPS.closePath) {
                  pathBuilder.closePath();
                }
              }
            } else if (pathData && typeof pathData === 'object') {
              // Try {ops: [...], args: [...]} structure
              if (pathData.ops && pathData.args) {
                const ops = pathData.ops;
                const pathArgs = pathData.args;
                for (let j = 0; j < ops.length; j++) {
                  const pathOp = ops[j];
                  const opArgs = pathArgs[j];
                  
                  if (pathOp === pdfjsLib.OPS.moveTo && Array.isArray(opArgs) && opArgs.length >= 2) {
                    pathBuilder.moveTo(opArgs[0], opArgs[1]);
                  } else if (pathOp === pdfjsLib.OPS.lineTo && Array.isArray(opArgs) && opArgs.length >= 2) {
                    pathBuilder.lineTo(opArgs[0], opArgs[1]);
                  } else if (pathOp === pdfjsLib.OPS.curveTo && Array.isArray(opArgs) && opArgs.length >= 6) {
                    pathBuilder.curveTo(opArgs[0], opArgs[1], opArgs[2], opArgs[3], opArgs[4], opArgs[5]);
                  } else if (pathOp === pdfjsLib.OPS.closePath) {
                    pathBuilder.closePath();
                  }
                }
              } else if (pathData.fnArray && pathData.argsArray) {
                // Alternative: {fnArray: [...], argsArray: [...]}
                const ops = pathData.fnArray;
                const pathArgs = pathData.argsArray;
                for (let j = 0; j < ops.length; j++) {
                  const pathOp = ops[j];
                  const opArgs = pathArgs[j];
                  
                  if (pathOp === pdfjsLib.OPS.moveTo && Array.isArray(opArgs) && opArgs.length >= 2) {
                    pathBuilder.moveTo(opArgs[0], opArgs[1]);
                  } else if (pathOp === pdfjsLib.OPS.lineTo && Array.isArray(opArgs) && opArgs.length >= 2) {
                    pathBuilder.lineTo(opArgs[0], opArgs[1]);
                  } else if (pathOp === pdfjsLib.OPS.curveTo && Array.isArray(opArgs) && opArgs.length >= 6) {
                    pathBuilder.curveTo(opArgs[0], opArgs[1], opArgs[2], opArgs[3], opArgs[4], opArgs[5]);
                  } else if (pathOp === pdfjsLib.OPS.closePath) {
                    pathBuilder.closePath();
                  }
                }
              }
            }
          }
          continue;
        }
        
        // Handle form XObjects - these contain nested graphics
        if (op === pdfjsLib.OPS.paintFormXObjectBegin) {
          // Form XObject begins - we might need to process nested operators
          // For now, continue processing
          continue;
        }
        
        if (op === pdfjsLib.OPS.paintFormXObjectEnd) {
          // Form XObject ends
          continue;
        }
        
        switch (op) {
          case pdfjsLib.OPS.transform:
            if (args && args.length >= 6) {
              pathBuilder.setTransform(args[0], args[1], args[2], args[3], args[4], args[5]);
            }
            break;
            
          case pdfjsLib.OPS.moveTo:
            if (args && args.length >= 2) {
              pathBuilder.moveTo(args[0], args[1]);
            }
            break;
            
          case pdfjsLib.OPS.lineTo:
            if (args && args.length >= 2) {
              pathBuilder.lineTo(args[0], args[1]);
            }
            break;
            
          case pdfjsLib.OPS.curveTo:
            if (args && args.length >= 6) {
              pathBuilder.curveTo(args[0], args[1], args[2], args[3], args[4], args[5]);
            }
            break;
            
          case pdfjsLib.OPS.closePath:
            pathBuilder.closePath();
            break;
            
          case pdfjsLib.OPS.fill:
            pathBuilder.setFillColor('#000000');
            pathBuilder.finishPath();
            break;
            
          case pdfjsLib.OPS.stroke:
            pathBuilder.setStrokeColor('#000000');
            pathBuilder.finishPath();
            break;
            
          case pdfjsLib.OPS.fillAndStroke:
            pathBuilder.setFillColor('#000000');
            pathBuilder.setStrokeColor('#000000');
            pathBuilder.finishPath();
            break;
            
          // Handle color operations
          case pdfjsLib.OPS.setFillRGBColor:
            if (args && args.length >= 3) {
              const r = Math.round(args[0] * 255);
              const g = Math.round(args[1] * 255);
              const b = Math.round(args[2] * 255);
              pathBuilder.setFillColor(`rgb(${r},${g},${b})`);
            }
            break;
            
          case pdfjsLib.OPS.setStrokeRGBColor:
            if (args && args.length >= 3) {
              const r = Math.round(args[0] * 255);
              const g = Math.round(args[1] * 255);
              const b = Math.round(args[2] * 255);
              pathBuilder.setStrokeColor(`rgb(${r},${g},${b})`);
            }
            break;
            
          case pdfjsLib.OPS.setLineWidth:
            if (args && args.length >= 1) {
              pathBuilder.setStrokeWidth(args[0]);
            }
            break;
            
          // Handle additional path construction operators
          case pdfjsLib.OPS.rectangle:
            if (args && args.length >= 4) {
              const x = args[0];
              const y = args[1];
              const w = args[2];
              const h = args[3];
              pathBuilder.moveTo(x, y);
              pathBuilder.lineTo(x + w, y);
              pathBuilder.lineTo(x + w, y + h);
              pathBuilder.lineTo(x, y + h);
              pathBuilder.closePath();
            }
            break;
            
          case pdfjsLib.OPS.appendRectangle:
            if (args && args.length >= 4) {
              const x = args[0];
              const y = args[1];
              const w = args[2];
              const h = args[3];
              pathBuilder.moveTo(x, y);
              pathBuilder.lineTo(x + w, y);
              pathBuilder.lineTo(x + w, y + h);
              pathBuilder.lineTo(x, y + h);
              pathBuilder.closePath();
            }
            break;
            
          // Handle bezier curves (alternative format)
          case pdfjsLib.OPS.curveto1:
            if (args && args.length >= 4) {
              // curveto1: x2 y2 x3 y3 (uses current point as first point)
              pathBuilder.curveTo(
                pathBuilder.currentX, pathBuilder.currentY,
                args[0], args[1],
                args[2], args[3]
              );
            }
            break;
            
          case pdfjsLib.OPS.curveto2:
            if (args && args.length >= 4) {
              // curveto2: x1 y1 x3 y3 (uses current point as second point)
              pathBuilder.curveTo(
                args[0], args[1],
                pathBuilder.currentX, pathBuilder.currentY,
                args[2], args[3]
              );
            }
            break;
        }
      } catch (err) {
        // Skip operators we can't handle
        continue;
      }
    }
    
    // Generate SVG
    const svg = pathBuilder.toSVG(viewport.width, viewport.height);
    
    // Determine output directory and filename
    const finalOutputDir = outputDir || dirname(pdfPath);
    const pdfBaseName = basename(pdfPath, extname(pdfPath));
    const finalFilename = outputFilename || `${pdfBaseName}-page${pageNumber}.svg`;
    
    // Create output directory if it doesn't exist
    mkdirSync(finalOutputDir, { recursive: true });
    
    // Save SVG
    const outputPath = join(finalOutputDir, finalFilename);
    writeFileSync(outputPath, svg, 'utf-8');
    
    console.log(`✓ Extracted vector graphics from page ${pageNumber}`);
    console.log(`  Saved: ${outputPath}`);
    console.log(`  Dimensions: ${Math.round(viewport.width)}x${Math.round(viewport.height)}`);
    console.log(`  Paths extracted: ${pathBuilder.paths.length}`);
    
    if (pathBuilder.paths.length === 0) {
      console.log(`\n  Note: No vector paths were found. The page might contain:`);
      console.log(`    - Raster images (not extractable as vectors)`);
      console.log(`    - Text rendered as fonts (may need font extraction)`);
      console.log(`    - Complex graphics using unsupported operators`);
    }
    
  } catch (error) {
    throw error;
  }
}

// Main function
async function main() {
  const pdfPath = process.argv[2];
  const pageNumber = process.argv[3] ? parseInt(process.argv[3], 10) : null;
  const outputDir = process.argv[4] || null;
  const outputFilename = process.argv[5] || null;
  
  if (!pdfPath) {
    console.error('Usage: node tools/extract-pdf-vectors.mjs <pdf-path> <page-number> [output-dir] [output-filename]');
    console.error('Example: node tools/extract-pdf-vectors.mjs src/assets/chips/esp32-c6-mini-1/datasheet.pdf 10 src/assets/chips/esp32-c6-mini-1 pinmap.svg');
    console.error('  pdf-path: Path to the PDF file');
    console.error('  page-number: Page number to extract (1-based)');
    console.error('  output-dir: Optional output directory (default: same as PDF)');
    console.error('  output-filename: Optional output filename (default: <pdf-name>-page<number>.svg)');
    process.exit(1);
  }
  
  if (!pageNumber || isNaN(pageNumber) || pageNumber < 1) {
    console.error('Error: page-number must be a positive integer');
    process.exit(1);
  }
  
  const fullPdfPath = pdfPath.startsWith('/') 
    ? pdfPath 
    : join(process.cwd(), pdfPath);
  
  try {
    await extractVectorGraphics(fullPdfPath, pageNumber, outputDir, outputFilename);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    console.error('\nNote: PDF vector extraction may not capture all graphics.');
    console.error('Complex PDFs with images, fonts, or special effects may require additional processing.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

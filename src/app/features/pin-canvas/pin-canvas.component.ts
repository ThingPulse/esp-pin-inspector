import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription, take } from 'rxjs';
import { ChipDefinition, PinDefinition, PinFunction } from '../../core/models';
import { SelectionService } from '../../core/services/selection.service';

@Component({
  selector: 'app-pin-canvas',
  templateUrl: './pin-canvas.component.html',
  styleUrls: ['./pin-canvas.component.css']
})
export class PinCanvasComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  @Input() chip!: ChipDefinition;
  @Input() selectedPinId: string | null = null;
  @Output() pinClick = new EventEmitter<PinDefinition>();

  getSelectedPin(): PinDefinition | null {
    if (!this.selectedPinId || !this.chip) return null;
    return this.chip.pins.find(p => p.id === this.selectedPinId) || null;
  }

  getFunctionColor(kind: string): string {
    const kindUpper = kind.toUpperCase();
    // Color mapping for different function types
    const colorMap: { [key: string]: string } = {
      'ADC': '#4CAF50',      // Green
      'RTC': '#2196F3',      // Blue
      'TOUCH': '#FF9800',    // Orange
      'GPIO': '#9E9E9E',     // Gray
      'UART': '#00BCD4',     // Cyan
      'SPI': '#9C27B0',      // Purple
      'I2C': '#F44336',      // Red
      'I2S': '#E91E63',      // Pink
      'PWM': '#FF5722',      // Deep Orange
      'DAC': '#8BC34A',      // Light Green
      'JTAG': '#795548',     // Brown
      'USB': '#3F51B5',      // Indigo
      'SDIO': '#009688',     // Teal
      'CAN': '#FFC107',      // Amber
    };
    return colorMap[kindUpper] || '#757575'; // Default gray
  }

  getBadgePosition(pin: PinDefinition): { x: number; y: number; side: 'right' | 'left' | 'top' | 'bottom' } {
    if (!this.chip) return { x: 0, y: 0, side: 'right' };
    
    const hit = this.getHitArea(pin);
    const badgeHeight = 20;
    const badgeSpacing = 24;
    const numBadges = pin.functions.length;
    const totalBadgeHeight = numBadges * badgeSpacing;
    
    // Try different positions: right, left, top, bottom
    const positions: Array<{ x: number; y: number; side: 'right' | 'left' | 'top' | 'bottom' }> = [
      { x: hit.x + hit.width + 8, y: hit.y + hit.height / 2, side: 'right' },
      { x: hit.x - 8, y: hit.y + hit.height / 2, side: 'left' },
      { x: hit.x + hit.width / 2, y: hit.y - totalBadgeHeight / 2 - 8, side: 'top' },
      { x: hit.x + hit.width / 2, y: hit.y + hit.height + totalBadgeHeight / 2 + 8, side: 'bottom' }
    ];
    
    // Find a position that doesn't collide with other pads
    for (const pos of positions) {
      if (!this.wouldBadgeCollide(pin, pos, numBadges)) {
        return pos;
      }
    }
    
    // If all positions collide, use right side anyway (better than nothing)
    return positions[0];
  }

  wouldBadgeCollide(selectedPin: PinDefinition, badgePos: { x: number; y: number; side: 'right' | 'left' | 'top' | 'bottom' }, numBadges: number): boolean {
    if (!this.chip) return false;
    
    const badgeHeight = 20;
    const badgeSpacing = 24;
    const maxBadgeWidth = 120; // Approximate max width
    
    // Check each badge position
    for (let i = 0; i < numBadges; i++) {
      const badgeY = badgePos.y + (i * badgeSpacing) - (numBadges * badgeSpacing / 2);
      const badgeRect = {
        x: badgePos.x - (badgePos.side === 'left' ? maxBadgeWidth : 0),
        y: badgeY - badgeHeight / 2,
        width: maxBadgeWidth,
        height: badgeHeight
      };
      
      // Check collision with all other pins
      for (const otherPin of this.chip.pins) {
        if (otherPin.id === selectedPin.id) continue; // Skip the selected pin itself
        
        const otherHit = this.getHitArea(otherPin);
        const otherRect = {
          x: otherHit.x,
          y: otherHit.y,
          width: otherHit.width,
          height: otherHit.height
        };
        
        // Check if rectangles overlap
        if (this.rectanglesOverlap(badgeRect, otherRect)) {
          return true;
        }
      }
    }
    
    return false;
  }

  rectanglesOverlap(rect1: { x: number; y: number; width: number; height: number }, 
                    rect2: { x: number; y: number; width: number; height: number }): boolean {
    return !(rect1.x + rect1.width < rect2.x ||
             rect2.x + rect2.width < rect1.x ||
             rect1.y + rect1.height < rect2.y ||
             rect2.y + rect2.height < rect1.y);
  }

  getBadgeX(pin: PinDefinition, index: number): number {
    const pos = this.getBadgePosition(pin);
    const func = pin.functions[index];
    const badgeWidth = this.getBadgeWidth(func);
    
    if (pos.side === 'left') {
      // For left side, badges are right-aligned
      return pos.x - badgeWidth;
    } else if (pos.side === 'top' || pos.side === 'bottom') {
      // For top/bottom, badges are horizontally centered on the pad
      return pos.x - badgeWidth / 2;
    } else {
      // For right side, badges start at pos.x
      return pos.x;
    }
  }

  getBadgeY(pin: PinDefinition, index: number): number {
    const pos = this.getBadgePosition(pin);
    const badgeSpacing = 24;
    const numBadges = pin.functions.length;
    
    if (pos.side === 'top' || pos.side === 'bottom') {
      // For top/bottom, badges are stacked vertically
      return pos.y + (index * badgeSpacing) - (numBadges * badgeSpacing / 2);
    } else {
      // For left/right, badges are vertically centered
      return pos.y + (index * badgeSpacing) - (numBadges * badgeSpacing / 2);
    }
  }

  getBadgeWidth(func: PinFunction): number {
    // Calculate width based on text content
    const baseWidth = func.kind.length * 7;
    const roleWidth = func.role ? (func.role.length + 4) * 5 : 0;
    return Math.max(50, baseWidth + roleWidth + 16); // Min 50px, add padding
  }
  @Output() pinUpdate = new EventEmitter<{ pinId: string; area: { x: number; y: number; w: number; h: number } }>();

  @ViewChild('overlay', { static: false }) overlayRef?: ElementRef<SVGSVGElement>;
  @ViewChild('svgContainer', { static: false }) svgContainerRef?: ElementRef<HTMLDivElement>;

  svgContent: SafeHtml | null = null;
  private lastSvgPath: string | null = null;
  private readonly defaultHitSize = 24;

  editingPin: PinDefinition | null = null;
  searchFilter = '';
  private sub = new Subscription();
  private dragState: {
    pin: PinDefinition;
    startX: number;
    startY: number;
    startHitArea: { x: number; y: number; width: number; height: number };
    mode: 'drag' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e';
  } | null = null;

  // Pan and zoom state
  panX = 0;
  panY = 0;
  zoom = 1;
  private panState: {
    isPanning: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null = null;
  private pinchState: {
    distance: number;
    centerX: number;
    centerY: number;
  } | null = null;

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private selection: SelectionService
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.selection.searchFilter$.subscribe(query => {
        this.searchFilter = query;
      })
    );
  }

  ngAfterViewInit(): void {
    // Add wheel event listener for zooming after view is initialized
    setTimeout(() => {
      if (this.svgContainerRef) {
        this.svgContainerRef.nativeElement.addEventListener('wheel', this.onWheel, { passive: false });
      }
    }, 0);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.svgContainerRef) {
      this.svgContainerRef.nativeElement.removeEventListener('wheel', this.onWheel);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chip']?.currentValue) {
      this.loadSvg();
    }
  }

  get debugEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('debug');
  }

  get editorEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('editor');
  }

  get isSvg(): boolean {
    return !!this.chip?.image?.toLowerCase().endsWith('.svg');
  }

  getHitArea(pin: PinDefinition) {
    if (pin.area) {
      return {
        x: pin.area.x,
        y: pin.area.y,
        width: pin.area.w,
        height: pin.area.h
      };
    }
    const size = this.defaultHitSize;
    return {
      x: pin.position.x - size / 2,
      y: pin.position.y - size / 2,
      width: size,
      height: size
    };
  }

  hasWarning(pin: PinDefinition): boolean {
    return pin.reserved?.level === 'info' || pin.reserved?.level === 'warn' || pin.reserved?.level === 'error';
  }

  isGndPin(pin: PinDefinition): boolean {
    const name = (pin.name || '').toUpperCase();
    const id = (pin.id || '').toUpperCase();
    return name.includes('GND') || id.includes('GND') || name === 'GROUND';
  }

  is3V3Pin(pin: PinDefinition): boolean {
    const name = (pin.name || '').toUpperCase();
    const id = (pin.id || '').toUpperCase();
    return name.includes('3V3') || id.includes('3V3') || name === '3.3V' || id === '3.3V';
  }

  isNcPin(pin: PinDefinition): boolean {
    const name = (pin.name || '').toUpperCase();
    const id = (pin.id || '').toUpperCase();
    return name === 'NC' || id.includes('NC') || pin.electrical?.type === 'NC';
  }

  matchesFilter(pin: PinDefinition): boolean {
    if (!this.searchFilter || this.searchFilter.trim() === '') {
      return true;
    }
    const query = this.searchFilter.toLowerCase().trim();
    
    // Helper function to check if a string contains the query
    const matches = (text: string | null | undefined): boolean => {
      return text ? text.toLowerCase().includes(query) : false;
    };
    
    // Check pin id
    if (matches(pin.id)) {
      return true;
    }
    
    // Check pin number
    if (matches(pin.number)) {
      return true;
    }
    
    // Check pin name
    if (matches(pin.name)) {
      return true;
    }
    
    // Check functions
    if (pin.functions && pin.functions.length > 0) {
      for (const func of pin.functions) {
        if (matches(func.kind)) {
          return true;
        }
        if (matches(func.role)) {
          return true;
        }
        if (matches(func.notes)) {
          return true;
        }
      }
    }
    
    // Check reserved info
    if (pin.reserved) {
      if (matches(pin.reserved.reason)) {
        return true;
      }
      if (pin.reserved.tags && pin.reserved.tags.length > 0) {
        for (const tag of pin.reserved.tags) {
          if (matches(tag)) {
            return true;
          }
        }
      }
    }
    
    // Check electrical info
    if (pin.electrical) {
      if (matches(pin.electrical.type)) {
        return true;
      }
      if (matches(pin.electrical.voltage)) {
        return true;
      }
    }
    
    return false;
  }

  getTransform(): string {
    // Use translate3d instead of translate to force GPU acceleration and prevent rasterization
    return `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`;
  }

  getTransformOrigin(): string {
    return '0 0';
  }

  // Zoom in
  zoomIn(): void {
    const newZoom = Math.min(this.zoom * 1.2, 32); // Max zoom 32x
    this.zoom = newZoom;
  }

  // Zoom out
  zoomOut(): void {
    const newZoom = Math.max(this.zoom / 1.2, 0.1); // Min zoom 0.1x
    this.zoom = newZoom;
  }

  // Reset zoom and pan to center the chip
  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  // Get opacity for main grid (fades out as zoom increases)
  getMainGridOpacity(): number {
    // At zoom 1: full opacity (1.0)
    // At zoom 2: half opacity (0.5)
    // At zoom 4: quarter opacity (0.25)
    // Fade out smoothly as zoom increases
    return Math.max(0, 1 / this.zoom);
  }

  // Get opacity for sub grid (fades in as zoom increases)
  getSubGridOpacity(): number {
    // At zoom 1: invisible (0)
    // At zoom 2: half opacity (0.5)
    // At zoom 4: full opacity (1.0)
    // Fade in smoothly as zoom increases
    return Math.min(1, (this.zoom - 1) / 3);
  }

  onWheel = (event: WheelEvent): void => {
    if (this.editorEnabled) return; // Don't zoom in editor mode
    
    event.preventDefault();
    event.stopPropagation();

    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(100, this.zoom * zoomFactor));

    // Get mouse position relative to the container
    const container = this.svgContainerRef?.nativeElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate zoom point in SVG coordinates (before zoom)
    const svgX = (mouseX - this.panX) / this.zoom;
    const svgY = (mouseY - this.panY) / this.zoom;

    // Update zoom
    this.zoom = newZoom;

    // Adjust pan to keep the point under the mouse fixed
    this.panX = mouseX - svgX * this.zoom;
    this.panY = mouseY - svgY * this.zoom;
  };

  onContainerMouseDown = (event: MouseEvent): void => {
    if (this.editorEnabled) return; // Don't pan in editor mode
    if (event.button !== 0) return; // Only left mouse button
    const target = event.target as HTMLElement;
    if (target.closest('.pin, .resize-handle, .pin-label')) return; // Don't pan if clicking on pins

    event.preventDefault();
    event.stopPropagation();
    this.panState = {
      isPanning: true,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: this.panX,
      startPanY: this.panY
    };
    document.addEventListener('mousemove', this.onPanMouseMove);
    document.addEventListener('mouseup', this.onPanMouseUp);
  };

  onPanMouseMove = (event: MouseEvent): void => {
    if (!this.panState || !this.panState.isPanning) return;
    const deltaX = event.clientX - this.panState.startX;
    const deltaY = event.clientY - this.panState.startY;
    // Pan values are relative to transform origin, so we can add directly
    this.panX = this.panState.startPanX + deltaX;
    this.panY = this.panState.startPanY + deltaY;
  };

  onPanMouseUp = (): void => {
    if (this.panState) {
      this.panState.isPanning = false;
      this.panState = null;
    }
    document.removeEventListener('mousemove', this.onPanMouseMove);
    document.removeEventListener('mouseup', this.onPanMouseUp);
  };

  // Touch event handlers for pinch zoom and pan
  onTouchStart = (event: TouchEvent): void => {
    if (this.editorEnabled) return;
    if (event.touches.length === 1) {
      // Single touch - start panning
      const touch = event.touches[0];
      this.panState = {
        isPanning: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startPanX: this.panX,
        startPanY: this.panY
      };
    } else if (event.touches.length === 2) {
      // Two touches - start pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      const container = this.svgContainerRef?.nativeElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        this.pinchState = {
          distance,
          centerX: centerX - rect.left,
          centerY: centerY - rect.top
        };
      }
    }
  };

  onTouchMove = (event: TouchEvent): void => {
    if (this.editorEnabled) return;
    event.preventDefault();
    
    if (event.touches.length === 1 && this.panState) {
      // Single touch - continue panning
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.panState.startX;
      const deltaY = touch.clientY - this.panState.startY;
      this.panX = this.panState.startPanX + deltaX;
      this.panY = this.panState.startPanY + deltaY;
    } else if (event.touches.length === 2 && this.pinchState) {
      // Two touches - pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const newDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      // Apply damping factor to make zoom less aggressive (0.15 = 15% of the distance change)
      const dampingFactor = 0.15;
      const rawZoomFactor = newDistance / this.pinchState.distance;
      const zoomFactor = 1 + (rawZoomFactor - 1) * dampingFactor;
      const newZoom = Math.max(0.1, Math.min(100, this.zoom * zoomFactor));

      // Calculate zoom point in SVG coordinates
      const svgX = (this.pinchState.centerX - this.panX) / this.zoom;
      const svgY = (this.pinchState.centerY - this.panY) / this.zoom;

      // Update zoom
      this.zoom = newZoom;

      // Adjust pan to keep the center point fixed
      this.panX = this.pinchState.centerX - svgX * this.zoom;
      this.panY = this.pinchState.centerY - svgY * this.zoom;

      // Update distance for next calculation
      this.pinchState.distance = newDistance;
    }
  };

  onTouchEnd = (): void => {
    this.panState = null;
    this.pinchState = null;
  };

  onOverlayClick(event: MouseEvent): void {
    if (!this.debugEnabled || !this.chip || !this.overlayRef) return;
    const svg = this.overlayRef.nativeElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = (this.chip.viewBox.width / rect.width) / this.zoom;
    const scaleY = (this.chip.viewBox.height / rect.height) / this.zoom;
    const x = Math.round((event.clientX - rect.left - this.panX) * scaleX);
    const y = Math.round((event.clientY - rect.top - this.panY) * scaleY);
    const size = this.defaultHitSize;
    const snippet = {
      id: "PIN_PLACEHOLDER",
      number: "Pxx",
      name: "PIN_PLACEHOLDER",
      position: { x, y },
      area: { x: x - Math.round(size / 2), y: y - Math.round(size / 2), w: size, h: size },
      functions: [ { kind: "GPIO" } ]
    };
    // eslint-disable-next-line no-console
    console.log('Pin JSON snippet (copy into pins[]):', JSON.stringify(snippet, null, 2));
  }

  onPinMouseDown(event: MouseEvent, pin: PinDefinition): void {
    if (!this.editorEnabled) return;
    event.stopPropagation();
    this.editingPin = pin;
    const svg = this.overlayRef?.nativeElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = (this.chip.viewBox.width / rect.width) / this.zoom;
    const scaleY = (this.chip.viewBox.height / rect.height) / this.zoom;
    const hitArea = this.getHitArea(pin);
    this.dragState = {
      pin,
      startX: (event.clientX - rect.left - this.panX) * scaleX,
      startY: (event.clientY - rect.top - this.panY) * scaleY,
      startHitArea: { ...hitArea },
      mode: 'drag'
    };
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onResizeHandleMouseDown(event: MouseEvent, pin: PinDefinition, mode: string): void {
    if (!this.editorEnabled) return;
    event.stopPropagation();
    this.editingPin = pin;
    const svg = this.overlayRef?.nativeElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = (this.chip.viewBox.width / rect.width) / this.zoom;
    const scaleY = (this.chip.viewBox.height / rect.height) / this.zoom;
    const hitArea = this.getHitArea(pin);
    this.dragState = {
      pin,
      startX: (event.clientX - rect.left - this.panX) * scaleX,
      startY: (event.clientY - rect.top - this.panY) * scaleY,
      startHitArea: { ...hitArea },
      mode: mode as any
    };
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.dragState || !this.overlayRef) return;
    const svg = this.overlayRef.nativeElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = (this.chip.viewBox.width / rect.width) / this.zoom;
    const scaleY = (this.chip.viewBox.height / rect.height) / this.zoom;
    const currentX = (event.clientX - rect.left - this.panX) * scaleX;
    const currentY = (event.clientY - rect.top - this.panY) * scaleY;
    const deltaX = currentX - this.dragState.startX;
    const deltaY = currentY - this.dragState.startY;

    let newHitArea = { ...this.dragState.startHitArea };

    if (this.dragState.mode === 'drag') {
      newHitArea.x = Math.round(this.dragState.startHitArea.x + deltaX);
      newHitArea.y = Math.round(this.dragState.startHitArea.y + deltaY);
    } else {
      const { mode, startHitArea } = this.dragState;
      if (mode.includes('n')) {
        newHitArea.y = Math.round(startHitArea.y + deltaY);
        newHitArea.height = Math.max(8, Math.round(startHitArea.height - deltaY));
      }
      if (mode.includes('s')) {
        newHitArea.height = Math.max(8, Math.round(startHitArea.height + deltaY));
      }
      if (mode.includes('w')) {
        newHitArea.x = Math.round(startHitArea.x + deltaX);
        newHitArea.width = Math.max(8, Math.round(startHitArea.width - deltaX));
      }
      if (mode.includes('e')) {
        newHitArea.width = Math.max(8, Math.round(startHitArea.width + deltaX));
      }
    }

    if (!this.dragState.pin.area) {
      this.dragState.pin.area = {
        x: newHitArea.x,
        y: newHitArea.y,
        w: newHitArea.width,
        h: newHitArea.height
      };
    } else {
      this.dragState.pin.area.x = newHitArea.x;
      this.dragState.pin.area.y = newHitArea.y;
      this.dragState.pin.area.w = newHitArea.width;
      this.dragState.pin.area.h = newHitArea.height;
    }
  };

  private onMouseUp = (): void => {
    if (this.dragState && this.dragState.pin.area) {
      this.pinUpdate.emit({
        pinId: this.dragState.pin.id,
        area: { ...this.dragState.pin.area }
      });
      this.dragState = null;
    }
    this.editingPin = null;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  private loadSvg(): void {
    if (!this.chip || !this.isSvg) {
      this.svgContent = null;
      return;
    }
    const path = `assets/chips/${this.chip.chipId}/${this.chip.image}`;
    if (path === this.lastSvgPath && this.svgContent) {
      return;
    }
    this.lastSvgPath = path;
    this.http
      .get(path, { responseType: 'text' })
      .pipe(take(1))
      .subscribe({
        next: svg => {
          // Inject rendering attributes directly into the SVG to prevent rasterization
          const modifiedSvg = this.injectSvgRenderingAttributes(svg);
          this.svgContent = this.sanitizer.bypassSecurityTrustHtml(modifiedSvg);
        },
        error: () => {
          this.svgContent = null;
          console.error(`Failed to load SVG image at ${path}`);
        }
      });
  }

  private injectSvgRenderingAttributes(svg: string): string {
    // Add rendering attributes to the root SVG element to prevent rasterization
    // These attributes ensure the SVG stays crisp at all zoom levels
    const svgTagRegex = /<svg([^>]*)>/i;
    const match = svg.match(svgTagRegex);
    
    if (match) {
      const attributes = match[1];
      // Check if attributes already exist to avoid duplicates
      let newAttributes = attributes;
      
      if (!attributes.includes('shape-rendering')) {
        newAttributes += ' shape-rendering="geometricPrecision"';
      }
      if (!attributes.includes('text-rendering')) {
        newAttributes += ' text-rendering="geometricPrecision"';
      }
      if (!attributes.includes('image-rendering')) {
        newAttributes += ' image-rendering="optimizeQuality"';
      }
      
      return svg.replace(svgTagRegex, `<svg${newAttributes}>`);
    }
    
    return svg;
  }
}


/**
 * SlideMAKER - Presentation State Management & Undo/Redo Engine
 */

class PresentationState {
  constructor() {
    this.title = 'Untitled Presentation';
    this.aspectRatio = CONFIG.defaultAspectRatio;
    this.presentationTheme = 'udes-emerald';
    this.activeSlideIndex = 0;
    this.selectedElementIds = [];
    this.clipboard = [];
    this.zoomLevel = 1.0;
    this.autoFitZoom = true;
    this.isPresenterMode = false;

    // Synchronized Global Title Style
    this.titleStyle = {
      fontFamily: 'JetBrains Mono',
      fontSize: 44,
      fontWeight: '700',
      fontStyle: 'normal',
      textDecoration: 'none',
      color: '#FFFFFF',
      textAlign: 'left',
      lineHeight: 1.2
    };
    this.isDiagramTitleSelected = false;

    // Undo / Redo History
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 40;
    this.isHistoryLocked = false;

    // Auto-Save & Dirty Tracking
    this.autoSaveKey = 'slidemaker_autosave_v1';
    this.isDirty = false;
    this.lastSavedAt = null;
    this._autoSaveTimer = null;
    this._quotaWarned = false;

    // Slides array - initialize with 1 clean slide using editable SVG template A background
    this.slides = [
      this.createBlankSlide({
        background: window.SvgBackgrounds
          ? window.SvgBackgrounds.createBgConfig('template_a', null, 'udes-emerald')
          : { type: 'pdf', value: 'assets/backgrounds/template_a.png', pdfId: 'template_a', pageNumber: 1 }
      })
    ];

    // Event listeners
    this.listeners = new Set();
  }

  // Generate unique ID
  generateId(prefix = 'el') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // Create a clean blank slide with specified background
  createBlankSlide(options = {}) {
    const bg = options.background || (window.SvgBackgrounds
      ? window.SvgBackgrounds.createBgConfig('template_e', null, this.presentationTheme)
      : { type: 'color', value: '#FFFFFF' });

    return {
      id: this.generateId('slide'),
      background: { ...bg },
      elements: options.elements ? [...options.elements] : [], // Clean blank canvas for the user to create freely
      notes: options.notes || '',
      transition: options.transition || 'fade',
      isZoomFlow: !!options.isZoomFlow,
      isNestedFlow: !!options.isNestedFlow,
      hasNestedDiagram: !!options.hasNestedDiagram,
      nestingLevel: options.nestingLevel !== undefined ? options.nestingLevel : (options.parentFlowSlideId ? 1 : 0),
      rootFlowSlideId: options.rootFlowSlideId || null,
      zoomFlowData: options.zoomFlowData ? JSON.parse(JSON.stringify(options.zoomFlowData)) : null,
      isFlowChild: !!options.isFlowChild,
      parentFlowSlideId: options.parentFlowSlideId || null,
      flowNodeId: options.flowNodeId || null,
      flowNodeIndex: options.flowNodeIndex !== undefined ? options.flowNodeIndex : null,
      flowNodeTitle: options.flowNodeTitle || '',
      flowNodeSubtitle: options.flowNodeSubtitle || '',
      flowNodeStatus: options.flowNodeStatus || '',
      flowNodeColor: options.flowNodeColor || '',
      flowNodeIcon: options.flowNodeIcon || '',
      thumbnailType: options.thumbnailType || 'canvas',
      childSlideIds: options.childSlideIds ? [...options.childSlideIds] : []
    };
  }

  // Subscribe to state changes
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Notify all listeners
  notify(changeType = 'general', details = {}) {
    const mutatingTypes = [
      'slideAdded', 'slideDuplicated', 'slideDeleted', 'slideReordered',
      'backgroundChanged', 'elementAdded', 'elementUpdated', 'elementsUpdated',
      'elementsDeleted', 'elementsDuplicated', 'elementsPasted',
      'layerOrderChanged', 'titleStyleSynced', 'historyRestore', 'titleChanged', 'notesChanged'
    ];
    if (mutatingTypes.includes(changeType)) {
      this.isDirty = true;
      this.scheduleAutoSave();
    }

    for (const listener of this.listeners) {
      try {
        listener(changeType, details, this);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  }

  // --- Auto-Save & Recovery (localStorage) ---

  scheduleAutoSave() {
    this.notifySaveStatus('saving');
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => {
      this.saveAutoSaveNow();
    }, 1000);
  }

  saveAutoSaveNow() {
    try {
      const payload = JSON.stringify(this.exportToJson());
      localStorage.setItem(this.autoSaveKey, payload);
      this.lastSavedAt = new Date();
      this._quotaWarned = false;
      this.notifySaveStatus('saved');
    } catch (err) {
      console.warn('Auto-save failed (storage quota or privacy mode):', err);
      this.notifySaveStatus('error');
      if (!this._quotaWarned && window.app && typeof window.app.showToast === 'function') {
        this._quotaWarned = true;
        window.app.showToast('Local auto-save full — use Save to download a backup.');
      }
    }
  }

  loadAutoSave() {
    try {
      const raw = localStorage.getItem(this.autoSaveKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) return false;
      const ok = this.loadFromJson(parsed);
      if (ok) {
        this.isDirty = false;
        this.lastSavedAt = new Date();
        this.notifySaveStatus('saved');
      }
      return ok;
    } catch (err) {
      console.warn('Failed to restore auto-save:', err);
      return false;
    }
  }

  clearAutoSave() {
    try {
      localStorage.removeItem(this.autoSaveKey);
    } catch (err) {}
    this.isDirty = false;
    this.notifySaveStatus('clean');
  }

  markClean() {
    this.isDirty = false;
    this.saveAutoSaveNow();
  }

  notifySaveStatus(status) {
    for (const listener of this.listeners) {
      try {
        listener('autosaveStatus', { status, lastSavedAt: this.lastSavedAt }, this);
      } catch (err) {}
    }
  }

  // Get active slide object
  getActiveSlide() {
    if (this.activeSlideIndex < 0 || this.activeSlideIndex >= this.slides.length) {
      this.activeSlideIndex = 0;
    }
    return this.slides[this.activeSlideIndex] || null;
  }

  getCurrentSlide() {
    return this.getActiveSlide();
  }

  // Get single selected element or null
  getSelectedElement() {
    if (this.selectedElementIds.length !== 1) return null;
    const slide = this.getActiveSlide();
    if (!slide) return null;
    return slide.elements.find(el => el.id === this.selectedElementIds[0]) || null;
  }

  // Get array of all selected elements
  getSelectedElements() {
    const slide = this.getActiveSlide();
    if (!slide) return [];
    return slide.elements.filter(el => this.selectedElementIds.includes(el.id));
  }

  // Select single element
  selectElement(elementId, addToSelection = false) {
    this.isDiagramTitleSelected = false;
    if (!elementId) {
      this.clearSelection();
      return;
    }
    if (addToSelection) {
      if (this.selectedElementIds.includes(elementId)) {
        this.selectedElementIds = this.selectedElementIds.filter(id => id !== elementId);
      } else {
        this.selectedElementIds.push(elementId);
      }
    } else {
      this.selectedElementIds = [elementId];
    }
    this.notify('selection', { selectedIds: [...this.selectedElementIds] });
  }

  // Select multiple elements
  selectMultiple(elementIds) {
    this.isDiagramTitleSelected = false;
    this.selectedElementIds = [...elementIds];
    this.notify('selection', { selectedIds: [...this.selectedElementIds] });
  }

  // Select all elements on current slide
  selectAll() {
    this.isDiagramTitleSelected = false;
    const slide = this.getActiveSlide();
    if (!slide) return;
    this.selectedElementIds = slide.elements.map(el => el.id);
    this.notify('selection', { selectedIds: [...this.selectedElementIds] });
  }

  // Clear current selection
  clearSelection() {
    this.isDiagramTitleSelected = false;
    if (this.selectedElementIds.length > 0) {
      this.selectedElementIds = [];
      this.notify('selection', { selectedIds: [] });
    }
  }

  // Select Zoom Flow Diagram Title
  selectDiagramTitle() {
    this.selectedElementIds = [];
    this.isDiagramTitleSelected = true;
    this.notify('selection', { isDiagramTitle: true, selectedIds: [] });
  }

  deselectDiagramTitle() {
    if (this.isDiagramTitleSelected) {
      this.isDiagramTitleSelected = false;
      this.notify('selection', { isDiagramTitle: false, selectedIds: [] });
    }
  }

  // Switch active slide
  setActiveSlideIndex(index) {
    if (index >= 0 && index < this.slides.length && index !== this.activeSlideIndex) {
      this.activeSlideIndex = index;
      this.selectedElementIds = [];
      this.isDiagramTitleSelected = false;
      this.notify('slideChange', { activeIndex: index });
    }
  }

  // Snapshot a captured pre-action state for Undo (used when drag/interaction begins)
  savePreActionSnapshot(actionName = 'Edit', preSlidesSnapshot) {
    if (this.isHistoryLocked || !preSlidesSnapshot) return;

    const snapshot = {
      actionName,
      title: this.title,
      aspectRatio: this.aspectRatio,
      activeSlideIndex: this.activeSlideIndex,
      slides: preSlidesSnapshot
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
    this.notify('history', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  // Snapshot current state for Undo
  saveHistory(actionName = 'Edit') {
    if (this.isHistoryLocked) return;

    const snapshot = {
      actionName,
      title: this.title,
      aspectRatio: this.aspectRatio,
      activeSlideIndex: this.activeSlideIndex,
      slides: JSON.parse(JSON.stringify(this.slides))
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
    this.notify('history', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;

    const currentSnapshot = {
      actionName: 'Current State',
      title: this.title,
      aspectRatio: this.aspectRatio,
      activeSlideIndex: this.activeSlideIndex,
      slides: JSON.parse(JSON.stringify(this.slides))
    };
    this.redoStack.push(currentSnapshot);

    const previousSnapshot = this.undoStack.pop();
    this.isHistoryLocked = true;

    this.title = previousSnapshot.title;
    this.aspectRatio = previousSnapshot.aspectRatio;
    this.slides = previousSnapshot.slides;
    this.activeSlideIndex = Math.min(previousSnapshot.activeSlideIndex, this.slides.length - 1);
    this.selectedElementIds = [];

    this.isHistoryLocked = false;
    this.notify('historyRestore', { action: 'undo' });
    this.notify('history', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  redo() {
    if (!this.canRedo()) return;

    const currentSnapshot = {
      actionName: 'Current State',
      title: this.title,
      aspectRatio: this.aspectRatio,
      activeSlideIndex: this.activeSlideIndex,
      slides: JSON.parse(JSON.stringify(this.slides))
    };
    this.undoStack.push(currentSnapshot);

    const nextSnapshot = this.redoStack.pop();
    this.isHistoryLocked = true;

    this.title = nextSnapshot.title;
    this.aspectRatio = nextSnapshot.aspectRatio;
    this.slides = nextSnapshot.slides;
    this.activeSlideIndex = Math.min(nextSnapshot.activeSlideIndex, this.slides.length - 1);
    this.selectedElementIds = [];

    this.isHistoryLocked = false;
    this.notify('historyRestore', { action: 'redo' });
    this.notify('history', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  // --- Slide Operations ---

  addSlide(options = {}, insertAfterIndex = null) {
    this.saveHistory('Add Slide');
    const newSlide = this.createBlankSlide(options);
    const targetIndex = insertAfterIndex !== null ? insertAfterIndex + 1 : this.activeSlideIndex + 1;
    
    this.slides.splice(targetIndex, 0, newSlide);
    this.activeSlideIndex = targetIndex;
    this.selectedElementIds = [];
    this.notify('slideAdded', { index: targetIndex, slide: newSlide });
    return newSlide;
  }

  addEmptyZoomFlowSlide(insertAfterIndex = null) {
    this.saveHistory('Add Empty Flow Slide');
    const emptyFlowData = {
      title: 'Flow Diagram',
      layout: 'linear-horizontal',
      theme: 'udes-emerald',
      nodes: []
    };
    const newSlide = this.createBlankSlide({
      background: { type: 'color', value: '#060910' },
      isZoomFlow: true,
      zoomFlowData: emptyFlowData,
      childSlideIds: []
    });
    const targetIndex = insertAfterIndex !== null ? insertAfterIndex + 1 : this.activeSlideIndex + 1;
    this.slides.splice(targetIndex, 0, newSlide);
    this.activeSlideIndex = targetIndex;
    this.selectedElementIds = [];
    this.notify('slideAdded', { index: targetIndex, slide: newSlide });
    return newSlide;
  }

  addZoomFlowSlide(flowData, insertAfterIndex = null) {
    this.saveHistory('Add Zoom Flow Slide');
    const newSlide = this.createBlankSlide({
      background: { type: 'color', value: '#060910' },
      isZoomFlow: true,
      zoomFlowData: JSON.parse(JSON.stringify(flowData))
    });
    const targetIndex = insertAfterIndex !== null ? insertAfterIndex + 1 : this.activeSlideIndex + 1;
    this.slides.splice(targetIndex, 0, newSlide);
    this.activeSlideIndex = targetIndex;
    this.selectedElementIds = [];
    this.notify('slideAdded', { index: targetIndex, slide: newSlide });
    return newSlide;
  }

  addZoomFlowWithChildren(flowData, insertAfterIndex = null) {
    this.saveHistory('Insert Zoom Flow Presentation');
    const targetIndex = insertAfterIndex !== null ? insertAfterIndex + 1 : this.activeSlideIndex + 1;

    const mainSlide = this.createBlankSlide({
      background: { type: 'color', value: '#060910' },
      isZoomFlow: true,
      zoomFlowData: JSON.parse(JSON.stringify(flowData)),
      childSlideIds: []
    });

    this.slides.splice(targetIndex, 0, mainSlide);

    // Generate regular child slides for each node
    const nodes = flowData.nodes || [];
    if (window.zoomFlowEngine && nodes.length > 0) {
      let offset = 1;
      nodes.forEach((node, i) => {
        const child = window.zoomFlowEngine.generateChildSlide(
          node,
          mainSlide.id,
          i,
          nodes.length,
          flowData.theme || 'udes-emerald'
        );
        child.nestingLevel = 1;
        child.rootFlowSlideId = mainSlide.id;
        mainSlide.childSlideIds.push(child.id);
        this.slides.splice(targetIndex + offset, 0, child);
        offset++;

        // If this node has a nested diagram, generate Level 2 grandchild slides
        if (node.nestedDiagram && Array.isArray(node.nestedDiagram.nodes) && node.nestedDiagram.nodes.length > 0) {
          child.hasNestedDiagram = true;
          child.isZoomFlow = true;
          child.isNestedFlow = true;
          child.zoomFlowData = JSON.parse(JSON.stringify(node.nestedDiagram));
          child.childSlideIds = child.childSlideIds || [];

          const subNodes = node.nestedDiagram.nodes;
          subNodes.forEach((subNode, sIdx) => {
            const grandChild = window.zoomFlowEngine.generateChildSlide(
              subNode,
              child.id,
              sIdx,
              subNodes.length,
              node.nestedDiagram.theme || flowData.theme || 'udes-emerald'
            );
            grandChild.parentFlowSlideId = child.id;
            grandChild.rootFlowSlideId = mainSlide.id;
            grandChild.nestingLevel = 2;
            grandChild.isFlowChild = true;
            child.childSlideIds.push(grandChild.id);
            this.slides.splice(targetIndex + offset, 0, grandChild);
            offset++;
          });
        }
      });
    }

    this.reorderSlidesHierarchically();
    this.activeSlideIndex = targetIndex;
    this.selectedElementIds = [];
    this.notify('slideAdded', { index: targetIndex, slide: mainSlide });
    return mainSlide;
  }

  reorderSlidesHierarchically() {
    if (!this.slides || this.slides.length <= 1) return;

    const currentActiveSlide = this.slides[this.activeSlideIndex];
    const ordered = [];
    const visited = new Set();

    // Helper to get direct children of a slide in canonical node order
    const getOrderedChildren = (parentSlide) => {
      const directChildren = this.slides.filter(s => s.parentFlowSlideId === parentSlide.id);
      if (directChildren.length <= 1) return directChildren;

      if (parentSlide.zoomFlowData && Array.isArray(parentSlide.zoomFlowData.nodes)) {
        const nodes = parentSlide.zoomFlowData.nodes;
        const getNodeIndex = (child) => {
          if (child.flowNodeId) {
            const idx = nodes.findIndex(n => n.id === child.flowNodeId);
            if (idx !== -1) return idx;
          }
          if (typeof child.flowNodeIndex === 'number' && child.flowNodeIndex >= 0 && child.flowNodeIndex < nodes.length) {
            return child.flowNodeIndex;
          }
          return 999;
        };

        directChildren.sort((a, b) => {
          const idxA = getNodeIndex(a);
          const idxB = getNodeIndex(b);
          if (idxA !== idxB) return idxA - idxB;
          return (a.flowNodeIndex ?? 0) - (b.flowNodeIndex ?? 0);
        });
      } else {
        directChildren.sort((a, b) => (a.flowNodeIndex ?? 0) - (b.flowNodeIndex ?? 0));
      }

      return directChildren;
    };

    // Recursive depth-first traversal
    const addSlideAndDescendants = (slide) => {
      if (visited.has(slide.id)) return;
      visited.add(slide.id);
      ordered.push(slide);

      const children = getOrderedChildren(slide);
      for (const child of children) {
        addSlideAndDescendants(child);
      }
    };

    // Process top-level slides in their current relative order
    for (const slide of this.slides) {
      const hasParent = slide.parentFlowSlideId && this.slides.some(s => s.id === slide.parentFlowSlideId);
      if (!hasParent) {
        addSlideAndDescendants(slide);
      }
    }

    // Safety fallback for any unvisited slides
    for (const slide of this.slides) {
      if (!visited.has(slide.id)) {
        ordered.push(slide);
      }
    }

    this.slides = ordered;

    if (currentActiveSlide) {
      const newActiveIdx = this.slides.indexOf(currentActiveSlide);
      if (newActiveIdx !== -1) {
        this.activeSlideIndex = newActiveIdx;
      }
    }
  }

  addNestedDiagramToNode(parentFlowSlideId, nodeIndex, nestedDiagramData = null) {
    const parentSlide = this.slides.find(s => s.id === parentFlowSlideId);
    if (!parentSlide || !parentSlide.zoomFlowData || !parentSlide.zoomFlowData.nodes) return null;
    const node = parentSlide.zoomFlowData.nodes[nodeIndex];
    if (!node) return null;

    this.saveHistory('Add Nested Diagram to Node');

    const defaultNestedData = nestedDiagramData || {
      title: `${node.title} - Sub-Diagram`,
      subtitle: '',
      theme: parentSlide.zoomFlowData.theme || 'udes-emerald',
      nodes: [],
      connections: []
    };

    node.nestedDiagram = defaultNestedData;

    // Find or create child slide for this node
    let childSlide = this.slides.find(s => s.parentFlowSlideId === parentSlide.id && (s.flowNodeId === node.id || s.flowNodeIndex === nodeIndex));
    if (!childSlide) {
      childSlide = window.zoomFlowEngine ? window.zoomFlowEngine.generateChildSlide(node, parentSlide.id, nodeIndex, parentSlide.zoomFlowData.nodes.length) : null;
      if (childSlide) {
        const pIdx = this.slides.indexOf(parentSlide);
        this.slides.splice(pIdx + 1 + nodeIndex, 0, childSlide);
      }
    }

    if (childSlide) {
      childSlide.hasNestedDiagram = true;
      childSlide.isZoomFlow = true;
      childSlide.isNestedFlow = true;
      childSlide.zoomFlowData = JSON.parse(JSON.stringify(defaultNestedData));
      childSlide.nestingLevel = 1;
      childSlide.rootFlowSlideId = parentSlide.id;
      childSlide.childSlideIds = childSlide.childSlideIds || [];

      // Generate Level 2 slides for sub-nodes
      const childIdx = this.slides.indexOf(childSlide);
      const subNodes = defaultNestedData.nodes;
      if (window.zoomFlowEngine && subNodes.length > 0) {
        subNodes.forEach((sn, sIdx) => {
          const grandChild = window.zoomFlowEngine.generateChildSlide(sn, childSlide.id, sIdx, subNodes.length, defaultNestedData.theme);
          grandChild.parentFlowSlideId = childSlide.id;
          grandChild.rootFlowSlideId = parentSlide.id;
          grandChild.nestingLevel = 2;
          grandChild.isFlowChild = true;
          childSlide.childSlideIds.push(grandChild.id);
          this.slides.splice(childIdx + 1 + sIdx, 0, grandChild);
        });
      }
    }

    this.reorderSlidesHierarchically();
    this.notify('slideAdded', { slide: childSlide });
    return childSlide;
  }

  removeNestedDiagramFromNode(parentFlowSlideId, nodeIndex) {
    const parentSlide = this.slides.find(s => s.id === parentFlowSlideId);
    if (!parentSlide || !parentSlide.zoomFlowData || !parentSlide.zoomFlowData.nodes) return;
    const node = parentSlide.zoomFlowData.nodes[nodeIndex];
    if (!node || !node.nestedDiagram) return;

    this.saveHistory('Remove Nested Diagram');
    delete node.nestedDiagram;

    const childSlide = this.slides.find(s => s.parentFlowSlideId === parentSlide.id && (s.flowNodeId === node.id || s.flowNodeIndex === nodeIndex));
    if (childSlide) {
      childSlide.hasNestedDiagram = false;
      childSlide.isNestedFlow = false;
      // Remove Level 2 grandchildren
      this.slides = this.slides.filter(s => s.parentFlowSlideId !== childSlide.id);
      childSlide.childSlideIds = [];
    }

    this.reorderSlidesHierarchically();
    this.notify('slideDeleted');
  }

  duplicateSlide(index = null) {
    const targetIdx = index !== null ? index : this.activeSlideIndex;
    const slideToDup = this.slides[targetIdx];
    if (!slideToDup) return;

    this.saveHistory('Duplicate Slide');
    const clonedSlide = JSON.parse(JSON.stringify(slideToDup));
    clonedSlide.id = this.generateId('slide');
    clonedSlide.elements.forEach(el => {
      el.id = this.generateId(el.type);
    });

    const newIdx = targetIdx + 1;
    this.slides.splice(newIdx, 0, clonedSlide);
    this.activeSlideIndex = newIdx;
    this.selectedElementIds = [];
    this.notify('slideDuplicated', { index: newIdx, slide: clonedSlide });
    return clonedSlide;
  }

  deleteSlide(index = null) {
    if (this.slides.length <= 1) {
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('A presentation must contain at least one slide.');
      }
      return;
    }
    const targetIdx = index !== null ? index : this.activeSlideIndex;
    this.saveHistory('Delete Slide');

    this.slides.splice(targetIdx, 1);

    if (this.activeSlideIndex >= this.slides.length) {
      this.activeSlideIndex = this.slides.length - 1;
    }
    this.selectedElementIds = [];
    this.notify('slideDeleted', { index: targetIdx });
  }

  reorderSlide(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= this.slides.length || toIndex >= this.slides.length) return;
    this.saveHistory('Reorder Slides');
    const [moved] = this.slides.splice(fromIndex, 1);
    this.slides.splice(toIndex, 0, moved);
    this.activeSlideIndex = toIndex;
    this.notify('slideReordered', { fromIndex, toIndex });
  }

  // Set Background for active slide or all slides
  setSlideBackground(bgConfig, applyToAll = false) {
    this.saveHistory('Change Background');
    const cloneBg = (cfg) => ({
      ...cfg,
      ...(cfg.colors ? { colors: { ...cfg.colors } } : {})
    });
    if (applyToAll) {
      this.slides.forEach(s => {
        s.background = cloneBg(bgConfig);
      });
    } else {
      const slide = this.getActiveSlide();
      if (slide) {
        slide.background = cloneBg(bgConfig);
      }
    }
    this.notify('backgroundChanged', { bgConfig, applyToAll });
  }

  // Update colors of an editable SVG template background on the active slide
  updateSvgBackgroundColors(colorChanges, saveToHistory = false) {
    const slide = this.getActiveSlide();
    if (!slide || !slide.background || slide.background.type !== 'svg-template' || !window.SvgBackgrounds) return;

    if (saveToHistory) {
      this.saveHistory('Edit SVG Background Colors');
    }

    const templateId = slide.background.templateId || slide.background.pdfId || 'template_a';
    const nextColors = Object.assign(
      window.SvgBackgrounds.getDefaultColors(this.presentationTheme),
      slide.background.colors || {},
      colorChanges
    );

    slide.background.colors = nextColors;
    slide.background.value = window.SvgBackgrounds.toDataUrl(templateId, nextColors, this.presentationTheme);
    this.notify('backgroundChanged', { bgConfig: slide.background, applyToAll: false });
  }

  // Reset to a fresh, clean 1-slide presentation (for "New" button)
  resetToNewPresentation() {
    this.title = 'Untitled Presentation';
    this.aspectRatio = CONFIG.defaultAspectRatio;
    this.selectedElementIds = [];
    this.isDiagramTitleSelected = false;
    this.undoStack = [];
    this.redoStack = [];
    this.slides = [
      this.createBlankSlide({
        background: window.SvgBackgrounds
          ? window.SvgBackgrounds.createBgConfig('template_a', null, this.presentationTheme)
          : { type: 'color', value: '#FFFFFF' }
      })
    ];
    this.activeSlideIndex = 0;
    this.clearAutoSave();
    this.notify('presentationLoaded', { isNew: true });
  }

  // --- Element Operations ---

  addElement(elementData) {
    const slide = this.getActiveSlide();
    if (!slide) return null;

    this.saveHistory('Add Element');
    const newElement = {
      id: elementData.id || this.generateId(elementData.type || 'el'),
      type: elementData.type || 'text',
      x: elementData.x || 100,
      y: elementData.y || 100,
      width: elementData.width || 300,
      height: elementData.height || 100,
      rotation: elementData.rotation || 0,
      opacity: elementData.opacity !== undefined ? elementData.opacity : 1,
      zIndex: slide.elements.length + 1,
      ...elementData
    };

    slide.elements.push(newElement);
    this.selectElement(newElement.id);
    this.notify('elementAdded', { element: newElement });
    return newElement;
  }

  updateElement(elementId, changes, saveToHistory = true) {
    const slide = this.getActiveSlide();
    if (!slide) return;

    const el = slide.elements.find(e => e.id === elementId);
    if (!el) return;

    if (saveToHistory) {
      this.saveHistory('Edit Element');
    }

    Object.assign(el, changes);
    this.notify('elementUpdated', { elementId, changes, element: el });

    if (el.type === 'text' && (el.textType === 'title' || (el.id && el.id.toLowerCase().includes('title')))) {
      const styleProps = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY'];
      const hasStyleChange = styleProps.some(prop => changes[prop] !== undefined);
      if (hasStyleChange) {
        this.syncTitleStyleToAllSlides(changes, slide.id, false);
      }
    }
  }

  updateSelectedElements(changes, saveToHistory = true) {
    if (this.selectedElementIds.length === 0) return;
    if (saveToHistory) {
      this.saveHistory('Edit Elements');
    }
    const slide = this.getActiveSlide();
    if (!slide) return;

    let hasTitleElement = false;
    this.selectedElementIds.forEach(id => {
      const el = slide.elements.find(e => e.id === id);
      if (el) {
        Object.assign(el, changes);
        if (el.type === 'text' && (el.textType === 'title' || (el.id && el.id.toLowerCase().includes('title')))) {
          hasTitleElement = true;
        }
      }
    });
    this.notify('elementsUpdated', { ids: this.selectedElementIds, changes });

    // Synchronize title style across all slides if any title was edited
    const styleProps = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY'];
    const hasStyleChange = styleProps.some(prop => changes[prop] !== undefined);
    if (hasTitleElement && hasStyleChange) {
      this.syncTitleStyleToAllSlides(changes, slide.id, false);
    }
  }

  syncTitleStyleToAllSlides(changes, sourceSlideId = null, saveHistory = true) {
    if (!changes || typeof changes !== 'object') return;

    if (saveHistory) {
      this.saveHistory('Sync Title Style to All Slides');
    }

    const styleProps = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY'];
    const titleChanges = {};
    styleProps.forEach(prop => {
      if (changes[prop] !== undefined) {
        titleChanges[prop] = changes[prop];
      }
    });

    if (Object.keys(titleChanges).length === 0) return;

    this.titleStyle = Object.assign(this.titleStyle || {
      fontFamily: 'JetBrains Mono',
      fontSize: 44,
      fontWeight: '700',
      fontStyle: 'normal',
      textDecoration: 'none',
      color: '#FFFFFF',
      textAlign: 'left',
      lineHeight: 1.2
    }, titleChanges);

    // 1. Update all title elements across all regular slides
    this.slides.forEach(slide => {
      if (slide.elements && Array.isArray(slide.elements)) {
        slide.elements.forEach(el => {
          if (el.type === 'text' && (el.textType === 'title' || (el.id && el.id.toLowerCase().includes('title')))) {
            Object.assign(el, titleChanges);
          }
        });
      }

      // 2. Update Zoom Flow diagram slides
      if (slide.isZoomFlow && slide.zoomFlowData) {
        slide.zoomFlowData.titleStyle = Object.assign(slide.zoomFlowData.titleStyle || {}, titleChanges);
      }
    });

    // 3. Live update canvas active slide
    const activeSlide = this.getActiveSlide();
    if (activeSlide) {
      if (activeSlide.isZoomFlow) {
        const titleEl = document.querySelector('#slide-elements-layer .zf-diagram-title');
        const headerEl = document.querySelector('#slide-elements-layer .zf-diagram-header');
        if (titleEl) {
          if (titleChanges.fontFamily) titleEl.style.fontFamily = titleChanges.fontFamily;
          if (titleChanges.fontSize) titleEl.style.fontSize = `${titleChanges.fontSize}px`;
          if (titleChanges.fontWeight) titleEl.style.fontWeight = titleChanges.fontWeight;
          if (titleChanges.fontStyle) titleEl.style.fontStyle = titleChanges.fontStyle;
          if (titleChanges.textDecoration) titleEl.style.textDecoration = titleChanges.textDecoration;
          if (titleChanges.color) titleEl.style.color = titleChanges.color;
          if (titleChanges.textAlign) {
            titleEl.style.textAlign = titleChanges.textAlign;
            if (headerEl) {
              headerEl.style.alignItems = titleChanges.textAlign === 'center' ? 'center' : (titleChanges.textAlign === 'right' ? 'flex-end' : 'flex-start');
              headerEl.style.textAlign = titleChanges.textAlign;
            }
          }
        }
      } else if (window.canvasEngine) {
        window.canvasEngine.renderActiveSlide(false, true);
      }
    }

    if (window.slideManager) {
      window.slideManager.renderThumbnails();
    }

    this.notify('titleStyleSynced', { titleChanges });
  }

  deleteSelectedElements() {
    if (this.selectedElementIds.length === 0) return;
    const slide = this.getActiveSlide();
    if (!slide) return;

    this.saveHistory('Delete Elements');
    const deletedIds = [...this.selectedElementIds];
    slide.elements = slide.elements.filter(el => !this.selectedElementIds.includes(el.id));
    this.selectedElementIds = [];
    this.notify('elementsDeleted', { ids: deletedIds });
  }

  duplicateSelectedElements() {
    if (this.selectedElementIds.length === 0) return;
    const slide = this.getActiveSlide();
    if (!slide) return;

    this.saveHistory('Duplicate Elements');
    const newSelectedIds = [];

    this.selectedElementIds.forEach(id => {
      const el = slide.elements.find(e => e.id === id);
      if (el) {
        const cloned = JSON.parse(JSON.stringify(el));
        cloned.id = this.generateId(el.type);
        cloned.x += 30;
        cloned.y += 30;
        cloned.zIndex = slide.elements.length + 1;
        slide.elements.push(cloned);
        newSelectedIds.push(cloned.id);
      }
    });

    this.selectMultiple(newSelectedIds);
    this.notify('elementsDuplicated', { ids: newSelectedIds });
  }

  // Copy / Cut / Paste
  copySelectedElements() {
    const selected = this.getSelectedElements();
    if (selected.length === 0) return;
    this.clipboard = JSON.parse(JSON.stringify(selected));
    this.notify('clipboardChanged', { count: this.clipboard.length });
  }

  pasteElements() {
    if (!this.clipboard || this.clipboard.length === 0) return;
    const slide = this.getActiveSlide();
    if (!slide) return;

    this.saveHistory('Paste Elements');
    const newSelectedIds = [];

    this.clipboard.forEach(item => {
      const cloned = JSON.parse(JSON.stringify(item));
      cloned.id = this.generateId(item.type);
      cloned.x += 25;
      cloned.y += 25;
      cloned.zIndex = slide.elements.length + 1;
      slide.elements.push(cloned);
      newSelectedIds.push(cloned.id);
    });

    this.clipboard.forEach(item => {
      item.x += 25;
      item.y += 25;
    });

    this.selectMultiple(newSelectedIds);
    this.notify('elementsPasted', { ids: newSelectedIds });
  }

  // Layering
  bringToFront(elementId) {
    const slide = this.getActiveSlide();
    if (!slide) return;
    const index = slide.elements.findIndex(el => el.id === elementId);
    if (index === -1 || index === slide.elements.length - 1) return;

    this.saveHistory('Bring to Front');
    const [el] = slide.elements.splice(index, 1);
    slide.elements.push(el);
    this.reindexLayers(slide);
    this.notify('layerOrderChanged', { elementId, action: 'bringToFront' });
  }

  sendToBack(elementId) {
    const slide = this.getActiveSlide();
    if (!slide) return;
    const index = slide.elements.findIndex(el => el.id === elementId);
    if (index === -1 || index === 0) return;

    this.saveHistory('Send to Back');
    const [el] = slide.elements.splice(index, 1);
    slide.elements.unshift(el);
    this.reindexLayers(slide);
    this.notify('layerOrderChanged', { elementId, action: 'sendToBack' });
  }

  bringForward(elementId) {
    const slide = this.getActiveSlide();
    if (!slide) return;
    const index = slide.elements.findIndex(el => el.id === elementId);
    if (index === -1 || index === slide.elements.length - 1) return;

    this.saveHistory('Bring Forward');
    const temp = slide.elements[index];
    slide.elements[index] = slide.elements[index + 1];
    slide.elements[index + 1] = temp;
    this.reindexLayers(slide);
    this.notify('layerOrderChanged', { elementId, action: 'bringForward' });
  }

  sendBackward(elementId) {
    const slide = this.getActiveSlide();
    if (!slide) return;
    const index = slide.elements.findIndex(el => el.id === elementId);
    if (index === -1 || index === 0) return;

    this.saveHistory('Send Backward');
    const temp = slide.elements[index];
    slide.elements[index] = slide.elements[index - 1];
    slide.elements[index - 1] = temp;
    this.reindexLayers(slide);
    this.notify('layerOrderChanged', { elementId, action: 'sendBackward' });
  }

  reindexLayers(slide) {
    slide.elements.forEach((el, idx) => {
      el.zIndex = idx + 1;
    });
  }

  // Alignment & Distribution
  alignSelectedElements(mode) {
    const selected = this.getSelectedElements();
    if (selected.length === 0) return;

    const dims = CONFIG.aspectRatios[this.aspectRatio] || CONFIG.aspectRatios['16_9'];
    this.saveHistory(`Align (${mode})`);

    if (selected.length === 1) {
      const el = selected[0];
      if (mode === 'left') el.x = 0;
      else if (mode === 'center-h') el.x = Math.round((dims.width - el.width) / 2);
      else if (mode === 'right') el.x = Math.round(dims.width - el.width);
      else if (mode === 'top') el.y = 0;
      else if (mode === 'center-v') el.y = Math.round((dims.height - el.height) / 2);
      else if (mode === 'bottom') el.y = Math.round(dims.height - el.height);
    } else {
      const minX = Math.min(...selected.map(e => e.x));
      const maxX = Math.max(...selected.map(e => e.x + e.width));
      const minY = Math.min(...selected.map(e => e.y));
      const maxY = Math.max(...selected.map(e => e.y + e.height));
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      if (mode === 'left') selected.forEach(e => { e.x = Math.round(minX); });
      else if (mode === 'center-h') selected.forEach(e => { e.x = Math.round(midX - e.width / 2); });
      else if (mode === 'right') selected.forEach(e => { e.x = Math.round(maxX - e.width); });
      else if (mode === 'top') selected.forEach(e => { e.y = Math.round(minY); });
      else if (mode === 'center-v') selected.forEach(e => { e.y = Math.round(midY - e.height / 2); });
      else if (mode === 'bottom') selected.forEach(e => { e.y = Math.round(maxY - e.height); });
      else if (mode === 'distribute-h' && selected.length >= 3) {
        const sorted = [...selected].sort((a, b) => a.x - b.x);
        const totalElWidth = sorted.reduce((acc, e) => acc + e.width, 0);
        const span = (sorted[sorted.length - 1].x + sorted[sorted.length - 1].width) - sorted[0].x;
        const gap = (span - totalElWidth) / (sorted.length - 1);
        let cursor = sorted[0].x;
        sorted.forEach(e => {
          e.x = Math.round(cursor);
          cursor += e.width + gap;
        });
      } else if (mode === 'distribute-v' && selected.length >= 3) {
        const sorted = [...selected].sort((a, b) => a.y - b.y);
        const totalElHeight = sorted.reduce((acc, e) => acc + e.height, 0);
        const span = (sorted[sorted.length - 1].y + sorted[sorted.length - 1].height) - sorted[0].y;
        const gap = (span - totalElHeight) / (sorted.length - 1);
        let cursor = sorted[0].y;
        sorted.forEach(e => {
          e.y = Math.round(cursor);
          cursor += e.height + gap;
        });
      }
    }

    this.notify('elementsUpdated', { ids: this.selectedElementIds, changes: { aligned: mode } });
    if (window.canvasEngine) {
      window.canvasEngine.renderSelectionOverlay();
    }
  }

  // Build and load a comprehensive default showcase presentation covering all features
  loadShowcasePresentation(saveToHistory = false) {
    if (saveToHistory) {
      this.saveHistory('Load Feature Showcase');
    }

    const isGold = this.presentationTheme === 'black-gold';
    const accent = isGold ? '#D4AF37' : CONFIG.colors.udesGreen;
    const accentBright = isGold ? '#F5D061' : CONFIG.colors.udesLime;
    const titleCol = isGold ? '#F5D061' : '#FFFFFF';
    const subCol = isGold ? '#D4AF37' : '#CBD5E1';
    const bodyCol = isGold ? '#FAF8F2' : CONFIG.colors.udesBlack;
    const cardBg = isGold ? '#141418' : '#FFFFFF';
    const slideBg = (tpl) => window.SvgBackgrounds
      ? window.SvgBackgrounds.createBgConfig(tpl, null, this.presentationTheme)
      : { type: 'color', value: isGold ? '#09090B' : '#FFFFFF' };

    this.title = 'SlideMAKER Feature Showcase';
    this.aspectRatio = '16_9';
    this.titleStyle = Object.assign(this.titleStyle || {}, { color: titleCol });

    // Slide 1: Cover / Hero Slide
    const slide1 = this.createBlankSlide({
      background: slideBg('template_a', 1),
      notes: 'Welcome to SlideMAKER!\n\nTry these shortcuts:\n• Press F5 to present fullscreen\n• Press N in presentation mode to toggle these speaker notes\n• Press L for the virtual laser pointer\n• Click the palette icon in the header to switch between UdeS Emerald and Black & Gold themes.',
      elements: [
        ElementFactory.createShape('pill', {
          x: 80, y: 120, width: 220, height: 38,
          fillColor: accent, opacity: 0.92
        }),
        ElementFactory.createText({
          x: 92, y: 125, width: 196, height: 30,
          content: 'INTERACTIVE STUDIO',
          fontSize: 13, fontWeight: '700', color: isGold ? '#09090B' : '#FFFFFF',
          textAlign: 'center', padding: 4
        }),
        ElementFactory.createTitle({
          x: 80, y: 175, width: 820, height: 110,
          content: 'SlideMAKER Feature Showcase',
          fontSize: 48, color: titleCol
        }),
        ElementFactory.createSubtitle({
          x: 80, y: 290, width: 760, height: 70,
          content: 'Rich typography, vector graphics, live charts, embedded HTML widgets & cinematic Zoom-Flow diagrams.',
          fontSize: 22, color: isGold ? '#E5D3A1' : '#E2E8F0'
        }),
        ElementFactory.createLine({
          x: 80, y: 385, width: 320, height: 6,
          lineColor: accentBright, lineWidth: 5
        })
      ]
    });

    // Slide 2: Typography, Nested Lists, Shapes & Vector Icons
    const slide2 = this.createBlankSlide({
      background: slideBg('template_c', 3),
      notes: 'Slide 2 demonstrates multi-level bullet lists (double-click text and press Tab / Shift+Tab to indent), vector shapes, and FontAwesome icons.\n\nTry right-clicking any element for the context menu or selecting multiple items and using the Align dropdown.',
      elements: [
        ElementFactory.createTitle({
          x: 70, y: 50, width: 900, height: 80,
          content: 'Typography, Shapes & Vector Icons',
          fontSize: 40, color: isGold ? '#F5D061' : CONFIG.colors.udesDark
        }),
        ElementFactory.createLine({
          x: 70, y: 128, width: 240, height: 4,
          lineColor: accent, lineWidth: 4
        }),
        ElementFactory.createBulletList({
          x: 70, y: 165, width: 610, height: 420,
          color: bodyCol,
          content: '<ul><li><strong>Inline Rich Editing</strong><ul><li>Double-click any text box to edit directly</li><li>Use Tab / Shift+Tab for nested bullet levels</li></ul></li><li><strong>Precision Canvas Tools</strong><ul><li>Smart alignment guides &amp; 1-click Align / Distribute</li><li>Ctrl+Wheel zoom &amp; Space+Drag panning</li></ul></li><li><strong>Frictionless Media</strong><ul><li>Paste screenshots with Ctrl+V or drag-and-drop images</li></ul></li></ul>'
        }),
        ElementFactory.createShape('rounded-rect', {
          x: 730, y: 175, width: 220, height: 180,
          fillColor: accent, borderRadius: 18, shadowBlur: 12
        }),
        ElementFactory.createIcon('fa-wand-magic-sparkles', {
          x: 795, y: 205, width: 90, height: 90,
          iconColor: isGold ? '#09090B' : '#FFFFFF'
        }),
        ElementFactory.createText({
          x: 745, y: 300, width: 190, height: 42,
          content: 'Smart Styling',
          fontSize: 16, fontWeight: '700', color: isGold ? '#09090B' : '#FFFFFF',
          textAlign: 'center'
        }),
        ElementFactory.createShape('hexagon', {
          x: 985, y: 175, width: 185, height: 185,
          fillColor: isGold ? '#B8860B' : CONFIG.colors.udesForest, shadowBlur: 10
        }),
        ElementFactory.createIcon('fa-layer-group', {
          x: 1032, y: 222, width: 90, height: 90,
          iconColor: '#FFFFFF'
        }),
        ElementFactory.createShape('arrow-right', {
          x: 750, y: 410, width: 200, height: 80,
          fillColor: accentBright
        }),
        ElementFactory.createShape('star', {
          x: 1005, y: 385, width: 145, height: 145,
          fillColor: '#F59E0B'
        })
      ]
    });

    // Slide 3: Editable Data Table & Dynamic Chart.js Chart
    const slide3 = this.createBlankSlide({
      background: slideBg('template_b', 2),
      notes: 'Slide 3 showcases live editable tables (click any cell to type directly) alongside a dynamic Chart.js visualization.',
      elements: [
        ElementFactory.createTitle({
          x: 70, y: 50, width: 920, height: 80,
          content: 'Editable Tables & Dynamic Charts',
          fontSize: 40, color: isGold ? '#F5D061' : CONFIG.colors.udesDark
        }),
        ElementFactory.createTable(4, 3, {
          x: 70, y: 165, width: 540, height: 340,
          data: [
            ['Feature Area', 'Status', 'Impact'],
            ['Auto-Save & Undo', 'Active', 'High'],
            ['Zoom Flow Engine', 'Interactive', 'Very High'],
            ['Standalone Export', 'HTML / PDF', 'Portable']
          ],
          headerBg: accent,
          headerColor: isGold ? '#09090B' : '#FFFFFF',
          bodyBg: cardBg,
          alternateRowBg: isGold ? '#1D1A12' : '#F8FAFC',
          bodyColor: bodyCol,
          borderColor: isGold ? '#4A3E24' : '#CBD5E1'
        }),
        ElementFactory.createChart('bar', {
          x: 650, y: 165, width: 560, height: 380,
          chartTitle: 'Authoring Productivity Index',
          labels: ['Setup', 'Layout', 'Charts', 'Flow', 'Export'],
          datasets: [{
            label: 'Speed Score (%)',
            data: [88, 92, 85, 96, 94],
            backgroundColor: isGold
              ? ['#D4AF37', '#F5D061', '#B8860B', '#E8C568', '#9A7B2C']
              : [CONFIG.colors.udesGreen, CONFIG.colors.udesForest, CONFIG.colors.udesLime, CONFIG.colors.udesSlate, CONFIG.colors.accentGold],
            borderColor: accent,
            borderWidth: 2
          }],
          backgroundColor: cardBg,
          borderColor: isGold ? '#4A3E24' : '#E2E8F0'
        })
      ]
    });

    // Slide 4: Self-Contained HTML / SVG Interactive Widget
    const widgetBg = isGold
      ? 'linear-gradient(135deg, #141418 0%, #241D0F 100%)'
      : 'linear-gradient(135deg, #0D382A 0%, #087E5B 100%)';
    const widgetAccent = isGold ? '#F5D061' : '#7FC23F';

    const slide4 = this.createBlankSlide({
      background: slideBg('template_d', 4),
      notes: 'Slide 4 embeds a live, sandboxed HTML/SVG widget. Select it to edit its raw HTML source code directly in the right Properties inspector!',
      elements: [
        ElementFactory.createTitle({
          x: 70, y: 50, width: 920, height: 80,
          content: 'Embedded HTML & SVG Widgets',
          fontSize: 40, color: isGold ? '#F5D061' : CONFIG.colors.udesDark
        }),
        ElementFactory.createHtmlElement(
          `<div style="height:100%;box-sizing:border-box;padding:28px;background:${widgetBg};color:#fff;border-radius:14px;font-family:Inter,sans-serif;display:flex;flex-direction:column;justify-content:space-between;border:1px solid rgba(255,255,255,0.14);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${widgetAccent};font-weight:700;">Live Embedded HTML / SVG</div>
                <h2 style="margin:6px 0 0;font-size:26px;">Real-Time System Telemetry</h2>
              </div>
              <span style="padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.12);font-size:12px;font-weight:600;color:${widgetAccent};">&#9679; Operational</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0;">
              <div style="background:rgba(0,0,0,0.28);padding:16px;border-radius:10px;"><div style="font-size:11px;opacity:0.75;">EXPORT FORMATS</div><div style="font-size:28px;font-weight:800;color:${widgetAccent};margin-top:4px;">4</div></div>
              <div style="background:rgba(0,0,0,0.28);padding:16px;border-radius:10px;"><div style="font-size:11px;opacity:0.75;">OFFLINE READY</div><div style="font-size:28px;font-weight:800;color:${widgetAccent};margin-top:4px;">100%</div></div>
              <div style="background:rgba(0,0,0,0.28);padding:16px;border-radius:10px;"><div style="font-size:11px;opacity:0.75;">RENDER FPS</div><div style="font-size:28px;font-weight:800;color:${widgetAccent};margin-top:4px;">60</div></div>
            </div>
            <svg viewBox="0 0 600 70" style="width:100%;height:70px;">
              <polyline fill="none" stroke="${widgetAccent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="10,55 95,46 180,50 265,30 350,34 435,18 520,22 590,8"/>
            </svg>
          </div>`,
          { x: 70, y: 160, width: 760, height: 420, borderRadius: 14, shadowBlur: 14 }
        ),
        ElementFactory.createText({
          x: 870, y: 175, width: 340, height: 360,
          color: bodyCol,
          fontSize: 17,
          content: '<strong>Self-Contained HTML</strong><br><br>Drop any <code>.html</code> or <code>.svg</code> file from your computer, or paste custom markup.<br><br>Select the widget on the left to inspect and live-edit its HTML source in the Properties panel.'
        })
      ]
    });

    this.slides = [slide1, slide2, slide3, slide4];
    this.slides.forEach(s => {
      s.elements.forEach((el, idx) => {
        if (!el.id) el.id = this.generateId(el.type || 'el');
        if (!el.zIndex) el.zIndex = idx + 1;
        if (el.rotation === undefined) el.rotation = 0;
        if (el.opacity === undefined) el.opacity = 1;
      });
    });
    this.activeSlideIndex = 0;
    this.selectedElementIds = [];

    // Slide 5+: Interactive Zoom-In Flow Diagram with 3 Child Slides
    const flowData = {
      title: 'Interactive Zoom-Flow Pipeline',
      subtitle: 'Click any node to zoom into its dedicated slide',
      layout: 'linear-horizontal',
      theme: isGold ? 'black-gold' : 'udes-emerald',
      nodes: [
        {
          id: 'demo_node_1',
          title: '1. Author',
          subtitle: 'Design & Layout',
          icon: 'fa-compass-drafting',
          color: isGold ? '#D4AF37' : '#00A350',
          status: 'Stage 1',
          metricVal: '16:9',
          metricLbl: 'HD Canvas',
          summary: 'Build slides rapidly with smart snap guides, clipboard image paste, and synchronized title styles.',
          bullets: [
            'Drag-and-drop images and vector shapes',
            'Coalesced undo/redo and local auto-save',
            'One-click UdeS Emerald or Black & Gold theme'
          ]
        },
        {
          id: 'demo_node_2',
          title: '2. Connect',
          subtitle: 'Zoom-In Storytelling',
          icon: 'fa-diagram-project',
          color: isGold ? '#F5D061' : '#7FC23F',
          status: 'Stage 2',
          metricVal: '3D',
          metricLbl: 'Camera Zoom',
          summary: 'Turn complex architectures or workflows into interactive zoom-in diagrams with linked child slides.',
          bullets: [
            'Smooth camera zoom from overview to detail',
            'Supports nested sub-diagrams',
            'Automatic hierarchical slide navigator'
          ]
        },
        {
          id: 'demo_node_3',
          title: '3. Present & Export',
          subtitle: 'Share Anywhere',
          icon: 'fa-rocket',
          color: isGold ? '#B8860B' : '#087E5B',
          status: 'Stage 3',
          metricVal: '4x',
          metricLbl: 'Export Modes',
          summary: 'Present fullscreen with virtual laser pointer and speaker notes, or export standalone HTML, PDF, PNG, or ZIP.',
          bullets: [
            'Fullscreen presenter HUD with timer & notes (N)',
            'Standalone interactive HTML export',
            'High-resolution PDF and PNG bundles'
          ]
        }
      ]
    };

    const prevLocked = this.isHistoryLocked;
    this.isHistoryLocked = true;
    this.addZoomFlowWithChildren(flowData, this.slides.length - 1);
    this.isHistoryLocked = prevLocked;

    this.activeSlideIndex = 0;
    this.selectedElementIds = [];
    this.isDirty = false;
    this.notify('presentationLoaded', { showcase: true });
  }

  // Apply a complete visual theme across all slides in the presentation (Undo-safe)
  applyPresentationTheme(themeKey = 'udes-emerald') {
    this.saveHistory(`Apply Presentation Theme (${themeKey})`);
    this.presentationTheme = themeKey;

    const isGold = themeKey === 'black-gold';
    const bgConfig = isGold
      ? { type: 'gradient', value: 'linear-gradient(135deg, #09090B 0%, #1C170D 60%, #3A2C10 100%)' }
      : { type: 'pdf', value: 'assets/backgrounds/template_c.png', pdfId: 'template_c', pageNumber: 3 };

    const titleColor = isGold ? '#F5D061' : '#FFFFFF';
    const subtitleColor = isGold ? '#D4AF37' : '#306A5B';
    const bodyColor = isGold ? '#FAF8F2' : '#0F172A';
    const accentColor = isGold ? '#D4AF37' : CONFIG.colors.udesGreen;
    const secondaryAccent = isGold ? '#B8860B' : CONFIG.colors.udesForest;

    this.titleStyle = Object.assign(this.titleStyle || {}, { color: titleColor });

    this.slides.forEach((slide, idx) => {
      if (slide.isZoomFlow && slide.zoomFlowData) {
        slide.zoomFlowData.theme = isGold ? 'black-gold' : 'udes-emerald';
        slide.zoomFlowData.titleStyle = Object.assign(slide.zoomFlowData.titleStyle || {}, { color: titleColor });
        if (Array.isArray(slide.zoomFlowData.nodes)) {
          const palette = isGold
            ? ['#D4AF37', '#F5D061', '#B8860B', '#E8C568', '#9A7B2C']
            : ['#00A350', '#7FC23F', '#087E5B', '#306A5B', '#F59E0B'];
          slide.zoomFlowData.nodes.forEach((node, nIdx) => {
            node.color = palette[nIdx % palette.length];
          });
        }
      } else {
        // Dynamically recolor editable SVG templates (or convert legacy PNG templates to editable SVG)
        const existingTplId = slide.background && (slide.background.templateId || slide.background.pdfId);
        if (window.SvgBackgrounds && (slide.background?.type === 'svg-template' || slide.background?.type === 'pdf')) {
          const tplId = existingTplId || (idx === 0 ? 'template_a' : 'template_e');
          slide.background = window.SvgBackgrounds.createBgConfig(tplId, null, themeKey);
        } else if (window.SvgBackgrounds) {
          slide.background = window.SvgBackgrounds.createBgConfig(idx === 0 ? 'template_a' : 'template_e', null, themeKey);
        } else {
          slide.background = { ...bgConfig };
        }
      }

      if (slide.isFlowChild && slide.flowNodeColor) {
        const palette = isGold
          ? ['#D4AF37', '#F5D061', '#B8860B', '#E8C568', '#9A7B2C']
          : ['#00A350', '#7FC23F', '#087E5B', '#306A5B', '#F59E0B'];
        slide.flowNodeColor = palette[(slide.flowNodeIndex || 0) % palette.length];
      }

      if (Array.isArray(slide.elements)) {
        const swapHtmlColors = (str) => {
          if (typeof str !== 'string') return str;
          if (isGold) {
            return str
              .replace(/#0D382A/gi, '#141418')
              .replace(/#087E5B/gi, '#241D0F')
              .replace(/#00A350/gi, '#D4AF37')
              .replace(/#7FC23F/gi, '#F5D061')
              .replace(/#306A5B/gi, '#9A7B2C');
          }
          return str
            .replace(/#141418/gi, '#0D382A')
            .replace(/#241D0F/gi, '#087E5B')
            .replace(/#D4AF37/gi, '#00A350')
            .replace(/#F5D061/gi, '#7FC23F')
            .replace(/#9A7B2C/gi, '#306A5B');
        };

        slide.elements.forEach(el => {
          if (el.type === 'text') {
            if (el.textType === 'title' || (el.id && el.id.toLowerCase().includes('title'))) {
              el.color = titleColor;
            } else if (el.textType === 'subtitle') {
              el.color = subtitleColor;
            } else {
              el.color = bodyColor;
            }
            if (el.content) el.content = swapHtmlColors(el.content);
            if (el.borderColor && el.borderColor !== 'transparent') el.borderColor = accentColor;
          } else if (el.type === 'shape') {
            el.fillColor = accentColor;
            el.fillGradient = null;
            if (el.strokeColor && el.strokeColor !== 'transparent') el.strokeColor = accentColor;
          } else if (el.type === 'icon') {
            el.iconColor = accentColor;
          } else if (el.type === 'line') {
            el.lineColor = accentColor;
          } else if (el.type === 'image' && el.svgLogoType && window.SvgBackgrounds) {
            el.src = window.SvgBackgrounds.buildLogoDataUrl(el.svgLogoType, themeKey);
          } else if (el.type === 'html' && el.htmlContent) {
            el.htmlContent = swapHtmlColors(el.htmlContent);
          } else if (el.type === 'table') {
            el.headerBg = accentColor;
            el.headerColor = isGold ? '#09090B' : '#FFFFFF';
            el.bodyBg = isGold ? '#141418' : '#FFFFFF';
            el.alternateRowBg = isGold ? '#1D1A12' : '#F8FAFC';
            el.bodyColor = isGold ? '#FAF8F2' : CONFIG.colors.udesBlack;
            el.borderColor = isGold ? '#4A3E24' : '#CBD5E1';
          } else if (el.type === 'chart') {
            el.backgroundColor = isGold ? '#141418' : '#FFFFFF';
            el.borderColor = isGold ? '#4A3E24' : '#E2E8F0';
            if (Array.isArray(el.datasets) && el.datasets[0]) {
              el.datasets[0].backgroundColor = isGold
                ? ['#D4AF37', '#F5D061', '#B8860B', '#E8C568', '#9A7B2C']
                : [CONFIG.colors.udesGreen, CONFIG.colors.udesForest, CONFIG.colors.udesLime, CONFIG.colors.udesSlate, CONFIG.colors.accentGold];
              el.datasets[0].borderColor = secondaryAccent;
            }
          }
        });
      }
    });

    this.notify('backgroundChanged', { presentationTheme: themeKey, applyToAll: true });
    this.notify('elementsUpdated', { presentationTheme: themeKey });
    if (window.canvasEngine) window.canvasEngine.renderActiveSlide(true, true);
    if (window.slideManager) window.slideManager.renderThumbnails();
  }

  loadFromJson(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      this.title = data.title || 'UdeS Presentation';
      this.aspectRatio = data.aspectRatio || CONFIG.defaultAspectRatio;
      this.presentationTheme = data.presentationTheme || 'udes-emerald';
      this.slides = data.slides && data.slides.length > 0 ? data.slides : [this.createBlankSlide()];
      this.activeSlideIndex = 0;
      this.selectedElementIds = [];
      this.undoStack = [];
      this.redoStack = [];
      this.isDirty = false;
      this.notify('presentationLoaded', { presentation: data });
      return true;
    } catch (err) {
      console.error('Failed to parse presentation JSON:', err);
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('Invalid presentation file format.');
      }
      return false;
    }
  }

  exportToJson() {
    return {
      version: CONFIG.version,
      title: this.title,
      aspectRatio: this.aspectRatio,
      presentationTheme: this.presentationTheme || 'udes-emerald',
      createdAt: new Date().toISOString(),
      slides: this.slides
    };
  }
}

window.state = new PresentationState();

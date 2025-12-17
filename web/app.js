const API_BASE = '';

let currentIndex = null;
let currentTable = null;
let currentView = 'index';
let currentTab = 'overview';
let selectedPage = null;
let highlightTID = null;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDensityClass(density) {
    if (density >= 70) return 'high';
    if (density >= 40) return 'medium';
    return 'low';
}

function getPageClass(density, deadItems) {
    if (deadItems > 0) return 'dead';
    if (density >= 80) return 'full';
    if (density >= 50) return 'partial';
    if (density >= 10) return 'sparse';
    return 'empty';
}

async function fetchAPI(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function setConnectionStatus(connected, message = '') {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'Connected';
    } else {
        dot.className = 'status-dot error';
        text.textContent = message || 'Disconnected';
    }
}

function updateURL(type, name) {
    const url = type === 'index' ? `/index/${name}` : `/table/${name}`;
    history.pushState({ type, name }, '', url);
}

function loadFromURL() {
    const path = window.location.pathname;
    const indexMatch = path.match(/^\/index\/(.+)$/);
    const tableMatch = path.match(/^\/table\/(.+)$/);

    if (indexMatch) {
        const indexName = decodeURIComponent(indexMatch[1]);
        const btn = document.querySelector(`[data-index="${indexName}"]`);
        const tableName = btn?.dataset.table || null;
        selectIndex(indexName, tableName, false);
    } else if (tableMatch) {
        const tableName = decodeURIComponent(tableMatch[1]);
        selectTable(tableName, false);
    }
}

async function selectIndex(indexName, tableName, pushHistory = true) {
    currentIndex = indexName;
    currentTable = tableName || null;
    currentView = 'index';
    selectedPage = null;

    if (pushHistory) {
        updateURL('index', indexName);
    }

    document.querySelectorAll('.index-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.index === indexName);
    });
    document.querySelectorAll('.table-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById('mainContent').innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            Loading ${indexName}...
        </div>`;

    try {
        const [meta, stats, bloat, densityMap] = await Promise.all([
            fetchAPI(`/api/index/${indexName}/meta`),
            fetchAPI(`/api/index/${indexName}/stats`),
            fetchAPI(`/api/index/${indexName}/bloat`),
            fetchAPI(`/api/index/${indexName}/density`)
        ]);
        renderIndexView({ meta, stats, bloat, densityMap });
    } catch (err) {
        document.getElementById('mainContent').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h2>Error loading index</h2>
                <p>${err.message}</p>
            </div>`;
    }
}

let currentIndexData = null;

function renderIndexView(data) {
    currentIndexData = data;
    const { meta, stats, bloat, densityMap } = data;

    const html = `
        <div class="header animate-in">
            <h1 class="header-title">
                ${currentIndex}
                <span class="header-badge ${bloat.recommendAction === 'ok' ? 'success' : bloat.recommendAction === 'vacuum' ? 'warning' : 'danger'}">
                    ${bloat.recommendAction === 'ok' ? 'Healthy' : bloat.recommendAction === 'vacuum' ? 'Needs VACUUM' : 'Needs REINDEX'}
                </span>
            </h1>
            <p class="header-subtitle">B-tree index • Level ${stats.treeLevel} • ${formatBytes(stats.indexSize)}</p>
        </div>

        <div class="tabs">
            <button class="tab ${currentTab === 'overview' ? 'active' : ''}" onclick="switchTab('overview')">Overview</button>
            <button class="tab ${currentTab === 'pages' ? 'active' : ''}" onclick="switchTab('pages')">Pages</button>
            <button class="tab ${currentTab === 'bloat' ? 'active' : ''}" onclick="switchTab('bloat')">Bloat Analysis</button>
        </div>

        <div id="tabContent"></div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    renderTabContent();
}

function renderTabContent() {
    if (!currentIndexData) return;
    const { meta, stats, bloat, densityMap } = currentIndexData;
    const container = document.getElementById('tabContent');

    if (currentTab === 'overview') {
        container.innerHTML = renderOverviewTab(meta, stats, bloat, densityMap);
    } else if (currentTab === 'pages') {
        container.innerHTML = renderPagesTab(meta, stats, densityMap);
    } else if (currentTab === 'bloat') {
        container.innerHTML = renderBloatTab(stats, bloat, densityMap);
    }
}

function renderOverviewTab(meta, stats, bloat, densityMap) {
    const densityClass = getDensityClass(stats.avgLeafDensity);

    return `
        <div class="stats-grid animate-in">
            <div class="stat-card">
                <div class="stat-label">Tree Depth</div>
                <div class="stat-value">${stats.treeLevel}</div>
                <div class="stat-detail">levels</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Leaf Pages</div>
                <div class="stat-value">${stats.leafPages.toLocaleString()}</div>
                <div class="stat-detail">data pages</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Internal Pages</div>
                <div class="stat-value">${stats.internalPages.toLocaleString()}</div>
                <div class="stat-detail">navigation</div>
            </div>
            <div class="stat-card ${stats.emptyPages > 0 ? 'highlight-bad' : ''}">
                <div class="stat-label">Empty Pages</div>
                <div class="stat-value ${stats.emptyPages > 0 ? 'bad' : 'good'}">${stats.emptyPages.toLocaleString()}</div>
                <div class="stat-detail">wasted</div>
            </div>
            <div class="stat-card ${stats.deletedPages > 0 ? 'highlight-bad' : ''}">
                <div class="stat-label">Deleted Pages</div>
                <div class="stat-value ${stats.deletedPages > 0 ? 'warning' : 'good'}">${stats.deletedPages.toLocaleString()}</div>
                <div class="stat-detail">pending cleanup</div>
            </div>
            <div class="stat-card ${densityClass === 'low' ? 'highlight-bad' : densityClass === 'high' ? 'highlight-good' : ''}">
                <div class="stat-label">Avg Density</div>
                <div class="stat-value ${densityClass}">${stats.avgLeafDensity.toFixed(1)}%</div>
                <div class="stat-detail">leaf fill</div>
            </div>
        </div>

        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">📊 Index Structure</span>
                <div class="btree-actions">
                    <button class="btn" onclick="refreshIndex()">↻ Refresh</button>
                </div>
            </div>

            ${renderTreeStructure(meta, stats)}

            <div class="density-meter" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
                <div class="density-header">
                    <span class="density-label">Average Leaf Density</span>
                    <span class="density-value ${densityClass}">${stats.avgLeafDensity.toFixed(1)}%</span>
                </div>
                <div class="density-bar-container">
                    <div class="density-bar-fill ${densityClass}" style="width: ${stats.avgLeafDensity}%"></div>
                </div>
                <div class="density-markers">
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
            </div>
        </div>

        <!-- Quick summary -->
        <div class="bloat-panel animate-in" style="margin-top: 24px;">
            <div class="bloat-header">
                <span class="bloat-icon">${bloat.recommendAction === 'ok' ? '✅' : bloat.recommendAction === 'vacuum' ? '🧹' : '🔄'}</span>
                <span class="bloat-title">Health Summary</span>
            </div>
            <div class="bloat-recommendation ${bloat.recommendAction}">
                <div class="recommendation-text">
                    <div class="recommendation-title">${bloat.recommendAction === 'ok' ? 'Index is healthy' : bloat.recommendAction === 'vacuum' ? 'Consider running VACUUM' : 'REINDEX recommended'}</div>
                    <div class="recommendation-desc">
                        ${bloat.estimatedBloat.toFixed(1)}% estimated bloat • ${formatBytes(bloat.wastedBytes)} potentially reclaimable
                        <a href="#" onclick="switchTab('bloat'); return false;" style="color: var(--cyan-400); margin-left: 8px;">View details →</a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderPagesTab(meta, stats, densityMap) {
    return `
        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">🗂️ All Pages</span>
                <div class="btree-actions">
                    <button class="btn" onclick="refreshIndex()">↻ Refresh</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Total Pages</div>
                    <div class="stat-value">${(stats.leafPages + stats.internalPages + stats.emptyPages + stats.deletedPages).toLocaleString()}</div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Leaf Pages</div>
                    <div class="stat-value" style="color: var(--green-400);">${stats.leafPages.toLocaleString()}</div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Internal Pages</div>
                    <div class="stat-value" style="color: var(--blue-400);">${stats.internalPages.toLocaleString()}</div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Root Page</div>
                    <div class="stat-value" style="color: var(--purple-400); cursor: pointer;" onclick="loadPage(${meta.root})">${meta.root}</div>
                </div>
            </div>

            <div class="leaf-section">
                <div class="leaf-header">
                    <span class="leaf-title">Page Map (${densityMap.pages.length} pages) - Click to inspect</span>
                    <div class="leaf-legend">
                        <div class="legend-item"><div class="legend-box full"></div>Full (>80%)</div>
                        <div class="legend-item"><div class="legend-box partial"></div>Partial (50-80%)</div>
                        <div class="legend-item"><div class="legend-box sparse"></div>Sparse (10-50%)</div>
                        <div class="legend-item"><div class="legend-box empty"></div>Empty</div>
                        <div class="legend-item"><div class="legend-box dead"></div>Has dead items</div>
                    </div>
                </div>
                <div class="leaf-grid-wrapper">
                    <div class="leaf-grid">
                        ${renderLeafGrid(densityMap.pages)}
                    </div>
                </div>
            </div>

            <!-- Page density distribution -->
            <div style="margin-top: 24px; padding: 20px; background: var(--bg-primary); border-radius: 12px;">
                <div style="font-weight: 600; margin-bottom: 16px;">Density Distribution</div>
                ${renderDensityHistogram(densityMap.pages)}
            </div>
        </div>

        <div id="pageDetailPanel"></div>
    `;
}

function renderDensityHistogram(pages) {
    const leafPages = pages.filter(p => p.level === 0);
    const buckets = [
        { label: '0-20%', min: 0, max: 20, count: 0, color: 'var(--red-500)' },
        { label: '20-40%', min: 20, max: 40, count: 0, color: 'var(--orange-500)' },
        { label: '40-60%', min: 40, max: 60, count: 0, color: 'var(--yellow-500)' },
        { label: '60-80%', min: 60, max: 80, count: 0, color: 'var(--green-400)' },
        { label: '80-100%', min: 80, max: 100, count: 0, color: 'var(--green-500)' },
    ];

    leafPages.forEach(p => {
        for (const b of buckets) {
            if (p.density >= b.min && p.density < b.max) {
                b.count++;
                break;
            }
            if (b.max === 100 && p.density >= 80) {
                b.count++;
                break;
            }
        }
    });

    const maxCount = Math.max(...buckets.map(b => b.count), 1);

    return `
        <div style="display: flex; align-items: flex-end; gap: 8px; height: 120px;">
            ${buckets.map(b => `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="width: 100%; background: ${b.color}; border-radius: 4px 4px 0 0; height: ${(b.count / maxCount * 100).toFixed(0)}px; min-height: ${b.count > 0 ? '4px' : '0'}; transition: height 0.3s ease;"></div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; color: var(--text-secondary);">${b.count}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted);">${b.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderBloatTab(stats, bloat, densityMap) {
    const densityClass = getDensityClass(stats.avgLeafDensity);
    const leafPages = densityMap.pages.filter(p => p.level === 0);
    const pagesWithDead = leafPages.filter(p => p.deadItems > 0).length;
    const totalDeadItems = leafPages.reduce((sum, p) => sum + p.deadItems, 0);
    const totalLiveItems = leafPages.reduce((sum, p) => sum + p.liveItems, 0);

    // Calculate what a perfectly packed index would look like
    const avgItemsPerFullPage = 400; // Rough estimate for integer keys
    const optimalPages = Math.ceil(totalLiveItems / avgItemsPerFullPage);
    const potentialSavings = Math.max(0, stats.leafPages - optimalPages);

    return `
        <div class="stats-grid animate-in">
            <div class="stat-card ${bloat.estimatedBloat > 30 ? 'highlight-bad' : bloat.estimatedBloat > 10 ? '' : 'highlight-good'}">
                <div class="stat-label">Estimated Bloat</div>
                <div class="stat-value ${bloat.estimatedBloat > 30 ? 'bad' : bloat.estimatedBloat > 10 ? 'warning' : 'good'}">${bloat.estimatedBloat.toFixed(1)}%</div>
                <div class="stat-detail">of index size</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Wasted Space</div>
                <div class="stat-value">${formatBytes(bloat.wastedBytes)}</div>
                <div class="stat-detail">reclaimable</div>
            </div>
            <div class="stat-card ${densityClass === 'low' ? 'highlight-bad' : ''}">
                <div class="stat-label">Avg Density</div>
                <div class="stat-value ${densityClass}">${stats.avgLeafDensity.toFixed(1)}%</div>
                <div class="stat-detail">target: 90%</div>
            </div>
            <div class="stat-card ${stats.emptyPages > 0 ? 'highlight-bad' : ''}">
                <div class="stat-label">Empty Pages</div>
                <div class="stat-value ${stats.emptyPages > 0 ? 'bad' : 'good'}">${stats.emptyPages}</div>
                <div class="stat-detail">completely unused</div>
            </div>
            <div class="stat-card ${totalDeadItems > 0 ? 'highlight-bad' : ''}">
                <div class="stat-label">Dead Tuples</div>
                <div class="stat-value ${totalDeadItems > 0 ? 'bad' : 'good'}">${totalDeadItems.toLocaleString()}</div>
                <div class="stat-detail">in ${pagesWithDead} pages</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Live Tuples</div>
                <div class="stat-value good">${totalLiveItems.toLocaleString()}</div>
                <div class="stat-detail">actual data</div>
            </div>
        </div>

        <!-- Visual bloat representation -->
        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">📊 Space Usage</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <!-- Current state -->
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px;">
                    <div style="font-weight: 600; margin-bottom: 16px; color: var(--text-secondary);">Current Index</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px;">
                        ${Array(Math.min(50, stats.leafPages)).fill(0).map((_, i) => {
                            const page = leafPages[i];
                            const pageClass = page ? getPageClass(page.density, page.deadItems) : 'empty';
                            return `<div style="width: 16px; height: 24px; border-radius: 2px; background: var(--page-${pageClass === 'dead' ? 'dead' : pageClass === 'full' ? 'full' : pageClass === 'partial' ? 'partial' : pageClass === 'sparse' ? 'sparse' : 'full'}); ${pageClass === 'dead' ? 'opacity: 0.5;' : ''} ${pageClass === 'empty' ? 'border: 1px dashed var(--border-light); background: var(--bg-tertiary);' : ''}"></div>`;
                        }).join('')}
                        ${stats.leafPages > 50 ? `<div style="padding: 4px 8px; font-size: 0.7rem; color: var(--text-muted);">+${stats.leafPages - 50}</div>` : ''}
                    </div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.5rem; font-weight: 700;">${stats.leafPages} pages</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${formatBytes(stats.leafPages * 8192)}</div>
                </div>

                <!-- Optimal state -->
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px;">
                    <div style="font-weight: 600; margin-bottom: 16px; color: var(--green-400);">After REINDEX (estimated)</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px;">
                        ${Array(Math.min(50, optimalPages)).fill(0).map(() =>
                            `<div style="width: 16px; height: 24px; border-radius: 2px; background: var(--green-500); box-shadow: 0 0 4px var(--green-500);"></div>`
                        ).join('')}
                        ${optimalPages > 50 ? `<div style="padding: 4px 8px; font-size: 0.7rem; color: var(--text-muted);">+${optimalPages - 50}</div>` : ''}
                    </div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.5rem; font-weight: 700; color: var(--green-400);">~${optimalPages} pages</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">~${formatBytes(optimalPages * 8192)} (estimated)</div>
                </div>
            </div>

            <!-- Savings callout -->
            ${potentialSavings > 0 ? `
            <div style="margin-top: 20px; padding: 16px 20px; background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05)); border: 1px solid var(--green-500); border-radius: 12px; display: flex; align-items: center; gap: 16px;">
                <div style="font-size: 2rem;">💾</div>
                <div>
                    <div style="font-weight: 700; color: var(--green-400);">Potential savings: ~${potentialSavings} pages (${formatBytes(potentialSavings * 8192)})</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">REINDEX could reduce this index by approximately ${((potentialSavings / stats.leafPages) * 100).toFixed(0)}%</div>
                </div>
            </div>` : ''}
        </div>

        <!-- Recommendation -->
        ${renderBloatPanel(bloat)}

        <!-- Commands to run -->
        <div class="btree-container animate-in" style="margin-top: 24px;">
            <div class="btree-header">
                <span class="btree-title">🛠️ Maintenance Commands</span>
            </div>

            <div style="display: grid; gap: 16px;">
                <div style="background: var(--bg-primary); border-radius: 8px; padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: var(--yellow-400);">VACUUM (safe, non-blocking)</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Cleans dead tuples, doesn't reclaim space</span>
                    </div>
                    <code style="display: block; background: var(--bg-tertiary); padding: 12px; border-radius: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: var(--cyan-400);">VACUUM ${currentIndex ? currentIndex.replace('_pkey', '').replace('_idx', '') : 'table_name'};</code>
                </div>

                <div style="background: var(--bg-primary); border-radius: 8px; padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: var(--green-400);">REINDEX CONCURRENTLY (safe, minimal blocking)</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Rebuilds index, reclaims all space</span>
                    </div>
                    <code style="display: block; background: var(--bg-tertiary); padding: 12px; border-radius: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: var(--cyan-400);">REINDEX INDEX CONCURRENTLY ${currentIndex};</code>
                </div>

                <div style="background: var(--bg-primary); border-radius: 8px; padding: 16px; opacity: 0.7;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: var(--red-400);">REINDEX (fast, but locks table)</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">⚠️ Blocks writes during rebuild</span>
                    </div>
                    <code style="display: block; background: var(--bg-tertiary); padding: 12px; border-radius: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: var(--text-muted);">REINDEX INDEX ${currentIndex};</code>
                </div>
            </div>
        </div>
    `;
}

function renderTreeStructure(meta, stats) {
    // Tree visualization showing structure from root to leaves
    let html = '<div class="tree-wrapper">';

    // Root level
    html += `
        <div class="tree-level">
            <span class="level-label">ROOT</span>
            <div class="level-nodes">
                <div class="tree-node root" onclick="loadPage(${meta.root})" title="Page 0 is the metapage. The root starts at page ${meta.root}.">
                    <div class="tree-node-label">Page ${meta.root}</div>
                    <div class="tree-node-stats">Level ${meta.level}</div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); margin-left: 12px; align-self: center;">
                    ← Page 0 is metapage
                </div>
            </div>
        </div>`;

    // Internal levels (for treeLevel >= 2)
    if (stats.treeLevel >= 2) {
        html += '<div class="tree-connections">' + '<div class="connection-line"></div>'.repeat(Math.min(5, stats.internalPages)) + '</div>';
        html += `
            <div class="tree-level">
                <span class="level-label">INTERNAL</span>
                <div class="level-nodes">
                    ${Array(Math.min(5, stats.internalPages)).fill(0).map((_, i) => `
                        <div class="tree-node internal">
                            <div class="tree-node-label">Branch</div>
                            <div class="tree-node-stats">Level ${meta.level - 1}</div>
                        </div>
                    `).join('')}
                    ${stats.internalPages > 5 ? `<div class="tree-node internal" style="opacity: 0.6;"><div class="tree-node-label">+${stats.internalPages - 5}</div></div>` : ''}
                </div>
            </div>`;
    }

    // Additional internal level for very deep trees
    if (stats.treeLevel >= 3) {
        html += '<div class="tree-connections">' + '<div class="connection-line"></div>'.repeat(5) + '</div>';
        html += `
            <div class="tree-level">
                <span class="level-label">INTERNAL</span>
                <div class="level-nodes">
                    ${Array(Math.min(7, Math.floor(stats.internalPages / 2))).fill(0).map(() => `
                        <div class="tree-node internal">
                            <div class="tree-node-label">Branch</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    // Always show leaf level representation
    const leafCount = stats.leafPages;
    const showLeaves = Math.min(7, leafCount);
    html += '<div class="tree-connections">' + '<div class="connection-line"></div>'.repeat(showLeaves) + '</div>';
    html += `
        <div class="tree-level">
            <span class="level-label">LEAVES</span>
            <div class="level-nodes">
                ${Array(showLeaves).fill(0).map((_, i) => `
                    <div class="tree-node leaf">
                        <div class="tree-node-label">Leaf</div>
                        <div class="tree-node-stats">Level 0</div>
                    </div>
                `).join('')}
                ${leafCount > 7 ? `<div class="tree-node leaf" style="opacity: 0.6;"><div class="tree-node-label">+${leafCount - 7}</div></div>` : ''}
            </div>
        </div>
        <div style="text-align: center; margin-top: 12px; font-size: 0.8rem; color: var(--text-muted);">
            ${leafCount.toLocaleString()} leaf pages store the actual index entries pointing to table rows
        </div>`;

    html += '</div>';
    return html;
}

function renderLeafGrid(pages) {
    // Group by level, show only leaf pages (level 0)
    const leafPages = pages.filter(p => p.level === 0);

    // Limit display for performance
    const maxShow = 200;
    const pagesToShow = leafPages.slice(0, maxShow);

    let html = pagesToShow.map(p => {
        const pageClass = getPageClass(p.density, p.deadItems);
        return `<div class="leaf-page ${pageClass} ${selectedPage === p.blockNo ? 'selected' : ''}"
                     onclick="loadPage(${p.blockNo})"
                     title="Page ${p.blockNo}: ${p.density.toFixed(1)}% density, ${p.liveItems} live, ${p.deadItems} dead"></div>`;
    }).join('');

    if (leafPages.length > maxShow) {
        html += `<div style="padding: 8px; color: var(--text-muted); font-size: 0.75rem;">+${leafPages.length - maxShow} more pages</div>`;
    }

    return html;
}

function renderBloatPanel(bloat) {
    const actionConfig = {
        ok: { icon: '✅', title: 'Index is healthy', desc: 'No action needed. Density and page usage are within acceptable ranges.' },
        vacuum: { icon: '🧹', title: 'Consider running VACUUM', desc: 'Some dead tuples detected. VACUUM will clean dead entries but won\'t compact pages.' },
        reindex: { icon: '🔄', title: 'REINDEX recommended', desc: `Significant bloat detected (${bloat.estimatedBloat.toFixed(1)}%). REINDEX will rebuild the index optimally.` }
    };
    const action = actionConfig[bloat.recommendAction];

    return `
        <div class="bloat-panel animate-in">
            <div class="bloat-header">
                <span class="bloat-icon">📈</span>
                <span class="bloat-title">Bloat Analysis</span>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Total Pages</div>
                    <div class="stat-value">${bloat.totalPages.toLocaleString()}</div>
                </div>
                <div class="stat-card ${bloat.emptyPages > 0 ? 'highlight-bad' : ''}">
                    <div class="stat-label">Empty Pages</div>
                    <div class="stat-value ${bloat.emptyPages > 0 ? 'bad' : 'good'}">${bloat.emptyPages.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Estimated Bloat</div>
                    <div class="stat-value ${bloat.estimatedBloat > 30 ? 'bad' : bloat.estimatedBloat > 10 ? 'warning' : 'good'}">${bloat.estimatedBloat.toFixed(1)}%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Wasted Space</div>
                    <div class="stat-value">${formatBytes(bloat.wastedBytes)}</div>
                </div>
            </div>

            <div class="bloat-recommendation ${bloat.recommendAction}">
                <span style="font-size: 1.5rem;">${action.icon}</span>
                <div class="recommendation-text">
                    <div class="recommendation-title">${action.title}</div>
                    <div class="recommendation-desc">${action.desc}</div>
                </div>
            </div>
        </div>
    `;
}

// Load and display page details
async function loadPage(blockNo) {
    selectedPage = blockNo;

    // Update leaf grid selection
    document.querySelectorAll('.leaf-page').forEach(el => {
        el.classList.toggle('selected', el.onclick.toString().includes(`(${blockNo})`));
    });

    const panel = document.getElementById('pageDetailPanel');
    panel.innerHTML = `
        <div class="page-detail animate-in">
            <div class="loading">
                <div class="loading-spinner"></div>
                Loading page ${blockNo}...
            </div>
        </div>`;

    try {
        const detail = await fetchAPI(`/api/index/${currentIndex}/page/${blockNo}`);
        panel.innerHTML = renderPageDetail(detail);
    } catch (err) {
        panel.innerHTML = `
            <div class="page-detail">
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p>Failed to load page: ${err.message}</p>
                </div>
            </div>`;
    }
}

// Decode hex data to integer (for integer primary keys)
// PostgreSQL stores integers in little-endian format
function decodeKeyData(hexData) {
    if (!hexData || hexData.trim().length === 0) return '−∞';

    // Split by spaces and reverse for little-endian
    const bytes = hexData.trim().split(/\s+/);

    // For 4-byte integers (int4) - first 4 bytes, little-endian
    if (bytes.length >= 4) {
        const hex = bytes.slice(0, 4).reverse().join('');
        const val = parseInt(hex, 16);
        // Handle signed integers
        if (val > 0x7FFFFFFF) {
            return val - 0x100000000;
        }
        return val;
    }

    // For 2-byte integers (int2)
    if (bytes.length === 2) {
        const hex = bytes.reverse().join('');
        const val = parseInt(hex, 16);
        return val > 0x7FFF ? val - 0x10000 : val;
    }

    // Fallback - return raw hex
    return hexData.substring(0, 20) + (hexData.length > 20 ? '…' : '');
}

function renderPageDetail(detail) {
    const { stats, items: rawItems } = detail;
    const items = rawItems || [];
    const isLeaf = stats.btpoLevel === 0;
    const pageType = isLeaf ? 'leaf' : 'internal';
    const density = 100 * (stats.pageSize - stats.freeSize) / stats.pageSize;
    const usedBytes = stats.pageSize - stats.freeSize;

    // Get high key (first item on non-rightmost pages)
    const hasHighKey = stats.btpoNext !== 0 && items.length > 0;
    const highKeyRaw = hasHighKey ? items[0].data : null;
    const highKey = hasHighKey ? decodeKeyData(highKeyRaw) : '∞';

    // Skip high key item for display (it's not a real data item)
    const dataItems = hasHighKey ? items.slice(1) : items;

    // Count live vs dead
    const liveCount = dataItems.filter(i => !i.dead).length;
    const deadCount = dataItems.filter(i => i.dead).length;

    // Get key range
    const keys = dataItems.map(i => decodeKeyData(i.data)).filter(k => typeof k === 'number');
    const minKey = keys.length > 0 ? Math.min(...keys) : null;
    const maxKey = keys.length > 0 ? Math.max(...keys) : null;

    // Calculate sizes for visual representation
    const headerSize = 24; // Page header ~24 bytes
    const itemsSize = dataItems.reduce((sum, i) => sum + (i.itemLen || 16), 0);
    const specialSize = hasHighKey ? (items[0].itemLen || 16) : 0;

    return `
        <div class="page-detail animate-in">
            <div class="page-detail-header">
                <div class="page-detail-title">
                    <span style="font-size: 1.5rem;">📦</span>
                    <span style="font-size: 1.3rem; font-weight: 800;">Page ${stats.blockNo}</span>
                    <span class="page-badge ${pageType}" style="font-size: 0.85rem; padding: 6px 14px;">${isLeaf ? '🍃 Leaf' : '🌿 Internal'}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    ${stats.btpoPrev > 0 ? `<button class="btn" onclick="loadPage(${stats.btpoPrev})">← Page ${stats.btpoPrev}</button>` : ''}
                    ${stats.btpoNext > 0 ? `<button class="btn" onclick="loadPage(${stats.btpoNext})">Page ${stats.btpoNext} →</button>` : ''}
                    <button class="btn" onclick="document.getElementById('pageDetailPanel').innerHTML = ''">✕</button>
                </div>
            </div>

            <!-- VISUAL PAGE LAYOUT - THE BIG PICTURE -->
            <div style="background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-tertiary) 100%); border: 3px solid ${isLeaf ? 'var(--green-500)' : 'var(--blue-500)'}; border-radius: 16px; padding: 24px; margin-bottom: 24px; position: relative; overflow: hidden;">
                <!-- Background pattern -->
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.03; background-image: repeating-linear-gradient(0deg, transparent, transparent 20px, ${isLeaf ? 'var(--green-400)' : 'var(--blue-400)'} 20px, ${isLeaf ? 'var(--green-400)' : 'var(--blue-400)'} 21px);"></div>

                <div style="position: relative; z-index: 1;">
                    <!-- Page Size Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div style="font-size: 0.9rem; color: var(--text-muted);">8KB Page (${stats.pageSize.toLocaleString()} bytes)</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 2rem; font-weight: 800; color: ${density >= 70 ? 'var(--green-400)' : density >= 40 ? 'var(--yellow-400)' : 'var(--red-400)'};">
                            ${density.toFixed(0)}% Full
                        </div>
                    </div>

                    <!-- Visual Bar Representation of Page -->
                    <div style="background: var(--bg-primary); border-radius: 12px; height: 80px; display: flex; overflow: hidden; border: 2px solid var(--border-light); margin-bottom: 16px;">
                        <!-- Page Header -->
                        <div style="width: ${(headerSize / stats.pageSize * 100).toFixed(1)}%; min-width: 30px; background: linear-gradient(180deg, var(--purple-500), var(--purple-400)); display: flex; align-items: center; justify-content: center; flex-direction: column; border-right: 2px solid var(--bg-primary);">
                            <span style="font-size: 0.6rem; color: white; font-weight: 700;">HDR</span>
                        </div>
                        <!-- High Key (if present) -->
                        ${hasHighKey ? `
                        <div style="width: ${(specialSize / stats.pageSize * 100).toFixed(1)}%; min-width: 20px; background: linear-gradient(180deg, var(--purple-400), var(--purple-300)); display: flex; align-items: center; justify-content: center; border-right: 2px solid var(--bg-primary);">
                            <span style="font-size: 0.55rem; color: white; font-weight: 600; writing-mode: vertical-rl; transform: rotate(180deg);">HIGH KEY</span>
                        </div>` : ''}
                        <!-- Live Tuples -->
                        <div style="width: ${((liveCount * 16) / stats.pageSize * 100).toFixed(1)}%; background: linear-gradient(180deg, ${isLeaf ? 'var(--green-500)' : 'var(--blue-500)'}, ${isLeaf ? 'var(--green-400)' : 'var(--blue-400)'}); display: flex; align-items: center; justify-content: center; border-right: ${deadCount > 0 ? '2px solid var(--bg-primary)' : 'none'};">
                            <span style="font-size: 0.75rem; color: white; font-weight: 700;">${liveCount} LIVE</span>
                        </div>
                        <!-- Dead Tuples -->
                        ${deadCount > 0 ? `
                        <div style="width: ${((deadCount * 16) / stats.pageSize * 100).toFixed(1)}%; background: repeating-linear-gradient(45deg, var(--red-500), var(--red-500) 10px, var(--red-400) 10px, var(--red-400) 20px); display: flex; align-items: center; justify-content: center; border-right: 2px solid var(--bg-primary);">
                            <span style="font-size: 0.75rem; color: white; font-weight: 700; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${deadCount} DEAD</span>
                        </div>` : ''}
                        <!-- Free Space -->
                        <div style="flex: 1; background: repeating-linear-gradient(45deg, var(--bg-tertiary), var(--bg-tertiary) 10px, var(--bg-secondary) 10px, var(--bg-secondary) 20px); display: flex; align-items: center; justify-content: center;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${stats.freeSize.toLocaleString()} bytes FREE</span>
                        </div>
                    </div>

                    <!-- Key Range Display -->
                    <div style="display: flex; align-items: center; justify-content: center; gap: 20px; padding: 16px; background: var(--bg-secondary); border-radius: 12px;">
                        <div style="text-align: center;">
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">MIN KEY</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.5rem; font-weight: 800; color: ${isLeaf ? 'var(--green-400)' : 'var(--blue-400)'};">${minKey !== null ? minKey.toLocaleString() : '−'}</div>
                        </div>
                        <div style="font-size: 2rem; color: var(--text-muted);">→</div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">MAX KEY</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.5rem; font-weight: 800; color: ${isLeaf ? 'var(--green-400)' : 'var(--blue-400)'};">${maxKey !== null ? maxKey.toLocaleString() : '−'}</div>
                        </div>
                        ${hasHighKey ? `
                        <div style="border-left: 2px solid var(--border-light); padding-left: 20px; margin-left: 10px;">
                            <div style="font-size: 0.7rem; color: var(--purple-400); margin-bottom: 4px;">HIGH KEY (upper bound)</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.5rem; font-weight: 800; color: var(--purple-400);">${typeof highKey === 'number' ? highKey.toLocaleString() : highKey}</div>
                        </div>` : `
                        <div style="border-left: 2px solid var(--border-light); padding-left: 20px; margin-left: 10px;">
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">HIGH KEY</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.2rem; color: var(--text-muted);">∞ (rightmost)</div>
                        </div>`}
                    </div>
                </div>
            </div>

            <!-- Navigation Info -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; ${stats.btpoPrev > 0 ? 'cursor: pointer;' : 'opacity: 0.5;'}" ${stats.btpoPrev > 0 ? `onclick="loadPage(${stats.btpoPrev})"` : ''}>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 8px;">← PREVIOUS PAGE</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.3rem; font-weight: 700; color: ${stats.btpoPrev > 0 ? 'var(--cyan-400)' : 'var(--text-muted)'};">${stats.btpoPrev || 'None'}</div>
                </div>
                <div style="background: linear-gradient(135deg, ${isLeaf ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)'}, ${isLeaf ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)'}); border: 2px solid ${isLeaf ? 'var(--green-500)' : 'var(--blue-500)'}; border-radius: 12px; padding: 16px; text-align: center;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 8px;">CURRENT PAGE</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.5rem; font-weight: 800; color: ${isLeaf ? 'var(--green-400)' : 'var(--blue-400)'};">${stats.blockNo}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Level ${stats.btpoLevel}</div>
                </div>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; ${stats.btpoNext > 0 ? 'cursor: pointer;' : 'opacity: 0.5;'}" ${stats.btpoNext > 0 ? `onclick="loadPage(${stats.btpoNext})"` : ''}>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 8px;">NEXT PAGE →</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.3rem; font-weight: 700; color: ${stats.btpoNext > 0 ? 'var(--cyan-400)' : 'var(--text-muted)'};">${stats.btpoNext || 'None'}</div>
                </div>
            </div>

            <!-- TUPLES GRID - Visual representation -->
            <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-weight: 700; font-size: 1rem;">Index Tuples</div>
                    <div style="display: flex; gap: 16px; font-size: 0.8rem;">
                        <span style="color: var(--green-400);">● ${liveCount} live</span>
                        ${deadCount > 0 ? `<span style="color: var(--red-400);">● ${deadCount} dead</span>` : ''}
                    </div>
                </div>

                <!-- Tuple Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; max-height: 500px; overflow-y: auto; padding: 4px;">
                    ${dataItems.slice(0, 50).map((item, idx) => {
                        const keyVal = decodeKeyData(item.data);
                        const keyDisplay = typeof keyVal === 'number' ? keyVal.toLocaleString() : keyVal;

                        // Check for gap from previous item
                        let gapHtml = '';
                        if (idx > 0 && typeof keyVal === 'number') {
                            const prevKey = decodeKeyData(dataItems[idx - 1].data);
                            if (typeof prevKey === 'number' && keyVal - prevKey > 1) {
                                const gapSize = keyVal - prevKey - 1;
                                gapHtml = `
                                <div style="background: repeating-linear-gradient(45deg, rgba(239,68,68,0.1), rgba(239,68,68,0.1) 5px, rgba(239,68,68,0.05) 5px, rgba(239,68,68,0.05) 10px); border: 2px dashed var(--red-500); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; opacity: 0.8;">
                                    <div style="font-size: 1.5rem;">🕳️</div>
                                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; font-weight: 700; color: var(--red-400);">${gapSize} missing</div>
                                    <div style="font-size: 0.7rem; color: var(--text-muted);">${(prevKey + 1).toLocaleString()}${gapSize > 1 ? ` → ${(keyVal - 1).toLocaleString()}` : ''}</div>
                                </div>`;
                            }
                        }

                        return gapHtml + `
                        <div style="background: ${item.dead ? 'rgba(239,68,68,0.15)' : 'var(--bg-tertiary)'}; border: 2px solid ${item.dead ? 'var(--red-500)' : isLeaf ? 'var(--green-500)' : 'var(--blue-500)'}; border-radius: 10px; overflow: hidden; transition: transform 0.15s ease; cursor: default;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                            <div style="padding: 12px 14px; background: ${item.dead ? 'rgba(239,68,68,0.2)' : isLeaf ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)'}; border-bottom: 1px solid ${item.dead ? 'var(--red-500)' : isLeaf ? 'var(--green-500)' : 'var(--blue-500)'};">
                                <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.1rem; font-weight: 700; color: ${item.dead ? 'var(--red-400)' : isLeaf ? 'var(--green-400)' : 'var(--blue-400)'}; ${item.dead ? 'text-decoration: line-through;' : ''}">${keyDisplay}</div>
                            </div>
                            <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 0.65rem; color: var(--text-muted);">${isLeaf ? 'TID → Heap' : 'CHILD'}</div>
                                    ${isLeaf && currentTable ? `
                                    <div class="tid-link" onclick="navigateToTID('${currentTable}', ${item.ctid.replace(/[()]/g, '').split(',')[0]}, ${item.ctid.replace(/[()]/g, '').split(',')[1]})" title="Click to view this tuple in the heap">
                                        ${item.ctid} <span style="font-size: 0.7rem;">→</span>
                                    </div>` : `
                                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--text-secondary);">${item.ctid}</div>`}
                                </div>
                                ${item.dead ? `<div style="background: var(--red-500); color: white; font-size: 0.6rem; font-weight: 700; padding: 3px 8px; border-radius: 4px;">DEAD</div>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>

                ${dataItems.length > 50 ? `
                <div style="margin-top: 16px; padding: 20px; background: var(--bg-primary); border-radius: 12px; text-align: center;">
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px;">+${dataItems.length - 50} more tuples</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        Keys continue from <span style="font-family: 'IBM Plex Mono', monospace; color: var(--cyan-400);">${decodeKeyData(dataItems[50]?.data)}</span> to <span style="font-family: 'IBM Plex Mono', monospace; color: var(--cyan-400);">${decodeKeyData(dataItems[dataItems.length-1]?.data)}</span>
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;
}

function switchTab(tab) {
    currentTab = tab;
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tab));
    });
    // Re-render content without refetching
    renderTabContent();
}

function refreshIndex() {
    if (currentIndex) {
        selectIndex(currentIndex);
    }
}

// ==================== TABLE VIEW FUNCTIONS ====================

// Store table data globally for tab switching
let currentTableData = null;

// Select and load a table
async function selectTable(tableName, pushHistory = true) {
    currentTable = tableName;
    currentIndex = null;
    currentView = 'table';
    currentTab = 'overview';
    selectedPage = null;
    highlightTID = null;
    demoRowData = null;      // Reset demo state when switching tables
    demoResult = null;
    demoIndexInfo = null;    // Reset indexed columns info

    // Update URL
    if (pushHistory) {
        updateURL('table', tableName);
    }

    // Update sidebar buttons
    document.querySelectorAll('.table-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.table === tableName);
    });
    document.querySelectorAll('.index-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show loading
    document.getElementById('mainContent').innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            Loading ${tableName}...
        </div>`;

    try {
        // Fetch all table data in parallel
        const [detail, pageMap] = await Promise.all([
            fetchAPI(`/api/table/${tableName}`),
            fetchAPI(`/api/table/${tableName}/pages`)
        ]);

        currentTableData = { detail, pageMap };
        renderTableView(currentTableData);
    } catch (err) {
        document.getElementById('mainContent').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h2>Error loading table</h2>
                <p>${err.message}</p>
            </div>`;
    }
}

function renderTableView(data) {
    const { detail, pageMap } = data;
    const { info, stats, columns, indexes } = detail;

    const deadRatio = stats.deadTupleCount > 0 ?
        (stats.deadTupleCount / (stats.tupleCount + stats.deadTupleCount) * 100).toFixed(1) : 0;
    const healthStatus = deadRatio > 20 ? 'danger' : deadRatio > 5 ? 'warning' : 'success';

    const html = `
        <div class="header animate-in">
            <h1 class="header-title">
                ${currentTable}
                <span class="header-badge ${healthStatus}">
                    ${healthStatus === 'success' ? 'Healthy' : healthStatus === 'warning' ? 'Needs VACUUM' : 'High Bloat'}
                </span>
            </h1>
            <p class="header-subtitle">Heap Table • ${info.rowCount < 0 ? '~?' : info.rowCount.toLocaleString()} rows • ${formatBytes(info.size)}</p>
        </div>

        <div class="tabs">
            <button class="tab ${currentTab === 'overview' ? 'active' : ''}" onclick="switchTableTab('overview')">Overview</button>
            <button class="tab ${currentTab === 'pages' ? 'active' : ''}" onclick="switchTableTab('pages')">Pages</button>
            <button class="tab ${currentTab === 'storage' ? 'active' : ''}" onclick="switchTableTab('storage')">Storage Layout <sup style="font-size: 0.6em; opacity: 0.7;">INFO</sup></button>
            <button class="tab ${currentTab === 'demo' ? 'active' : ''}" onclick="switchTableTab('demo')">🧪 HOT Demo</button>
        </div>

        <div id="tableTabContent"></div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    renderTableTabContent();
}

function renderTableTabContent() {
    if (!currentTableData) return;
    const container = document.getElementById('tableTabContent');

    if (currentTab === 'overview') {
        container.innerHTML = renderTableOverviewTab();
    } else if (currentTab === 'pages') {
        container.innerHTML = renderTablePagesTab();
    } else if (currentTab === 'storage') {
        container.innerHTML = renderTableStorageTab();
    } else if (currentTab === 'demo') {
        container.innerHTML = renderDemoTab();
    }
}

function renderTableOverviewTab() {
    const { detail, pageMap } = currentTableData;
    const { info, stats, columns, indexes } = detail;

    const deadRatio = stats.deadTupleCount > 0 ?
        (stats.deadTupleCount / (stats.tupleCount + stats.deadTupleCount) * 100) : 0;
    const densityClass = getDensityClass(100 - (stats.freeSpacePercent || 0));

    // Find primary key column name
    const pkColumn = columns.find(c => c.isPK);
    const pkName = pkColumn ? pkColumn.name : 'id';

    return `
        <!-- Find Row Search Box -->
        <div class="btree-container animate-in" style="margin-bottom: 24px; background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(249, 115, 22, 0.05) 100%);">
            <div class="btree-header" style="border-bottom: none; padding-bottom: 0; margin-bottom: 16px;">
                <span class="btree-title">🔍 Find Row</span>
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 1; min-width: 250px;">
                    <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">Enter PK value or TID like (5,12)</label>
                    <input type="text" id="findRowInput" placeholder="e.g. 12345 or (5,12)"
                           style="width: 100%; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem;"
                           onkeypress="if(event.key==='Enter') findRowAuto()">
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn" onclick="findRowByPK()" style="padding: 10px 16px;" title="Find by primary key (${pkName})">Find by PK</button>
                    <button class="btn" onclick="findRowByTID()" style="padding: 10px 16px;" title="Find by TID (page,item)">Find by TID</button>
                </div>
            </div>
            <div id="findRowResult" style="margin-top: 16px;"></div>
        </div>

        <div class="stats-grid animate-in">
            <div class="stat-card">
                <div class="stat-label">Live Rows</div>
                <div class="stat-value good">${stats.tupleCount.toLocaleString()}</div>
                <div class="stat-detail">active data</div>
            </div>
            <div class="stat-card ${stats.deadTupleCount > 0 ? 'highlight-bad' : ''}">
                <div class="stat-label">Dead Rows</div>
                <div class="stat-value ${stats.deadTupleCount > 0 ? 'bad' : 'good'}">${stats.deadTupleCount.toLocaleString()}</div>
                <div class="stat-detail">${deadRatio.toFixed(1)}% of total</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Pages</div>
                <div class="stat-value">${info.totalPages.toLocaleString()}</div>
                <div class="stat-detail">8KB each</div>
            </div>
            <div class="stat-card ${densityClass === 'low' ? 'highlight-bad' : densityClass === 'high' ? 'highlight-good' : ''}">
                <div class="stat-label">Fill Ratio</div>
                <div class="stat-value ${densityClass}">${(100 - (stats.freeSpacePercent || 0)).toFixed(1)}%</div>
                <div class="stat-detail">page utilization</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Tuple Size</div>
                <div class="stat-value">${stats.tupleLen || 'N/A'}</div>
                <div class="stat-detail">bytes per row</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Indexes</div>
                <div class="stat-value">${indexes.length}</div>
                <div class="stat-detail">on this table</div>
            </div>
        </div>

        <!-- Columns -->
        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">📋 Columns (${columns.length})</span>
            </div>
            <div style="display: grid; gap: 8px;">
                ${columns.map((col, i) => `
                    <div style="display: grid; grid-template-columns: auto 1fr auto auto; gap: 16px; padding: 12px 16px; background: var(--bg-primary); border-radius: 8px; align-items: center;">
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; color: var(--text-muted); width: 30px;">#${col.position}</div>
                        <div>
                            <span style="font-weight: 600; color: var(--text-primary);">${col.name}</span>
                            ${col.isPK ? '<span style="margin-left: 8px; background: var(--purple-500); color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;">PK</span>' : ''}
                        </div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: var(--orange-400);">${col.type}</div>
                        <div style="font-size: 0.75rem; color: ${col.notNull ? 'var(--cyan-400)' : 'var(--text-muted)'};">${col.notNull ? 'NOT NULL' : 'nullable'}</div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Indexes on this table -->
        <div class="btree-container animate-in" style="margin-top: 24px;">
            <div class="btree-header">
                <span class="btree-title">🌲 Indexes (${indexes.length})</span>
            </div>
            ${indexes.length === 0 ? `
                <div style="padding: 20px; text-align: center; color: var(--text-muted);">No indexes on this table</div>
            ` : `
                <div style="display: grid; gap: 8px;">
                    ${indexes.map(idx => `
                        <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 16px; padding: 12px 16px; background: var(--bg-primary); border-radius: 8px; align-items: center; cursor: pointer; transition: all 0.15s ease;"
                             onclick="selectIndex('${idx.name}', '${currentTable}')"
                             onmouseover="this.style.background='var(--bg-tertiary)'"
                             onmouseout="this.style.background='var(--bg-primary)'">
                            <div>
                                <span style="font-weight: 600; color: var(--green-400);">${idx.name}</span>
                                ${idx.isPrimary ? '<span style="margin-left: 8px; background: var(--purple-500); color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;">PRIMARY</span>' : ''}
                                ${idx.isUnique && !idx.isPrimary ? '<span style="margin-left: 8px; background: var(--blue-500); color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;">UNIQUE</span>' : ''}
                            </div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--text-secondary);">${idx.columns.join(', ')}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${formatBytes(idx.size)}</div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>

        <!-- Health Summary -->
        <div class="bloat-panel animate-in" style="margin-top: 24px;">
            <div class="bloat-header">
                <span class="bloat-icon">${deadRatio > 20 ? '🔄' : deadRatio > 5 ? '🧹' : '✅'}</span>
                <span class="bloat-title">Health Summary</span>
            </div>
            <div class="bloat-recommendation ${deadRatio > 20 ? 'reindex' : deadRatio > 5 ? 'vacuum' : 'ok'}">
                <div class="recommendation-text">
                    <div class="recommendation-title">${deadRatio > 20 ? 'VACUUM FULL recommended' : deadRatio > 5 ? 'Consider running VACUUM' : 'Table is healthy'}</div>
                    <div class="recommendation-desc">
                        ${deadRatio.toFixed(1)}% dead tuples • ${formatBytes(stats.deadTupleLen || 0)} reclaimable
                        <a href="#" onclick="switchTableTab('pages'); return false;" style="color: var(--cyan-400); margin-left: 8px;">View pages →</a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderTablePagesTab() {
    const { detail, pageMap } = currentTableData;
    const { info, stats } = detail;

    // Calculate page statistics
    const totalPages = pageMap.pages?.length || 0;
    const pagesWithDead = pageMap.pages?.filter(p => p.deadItems > 0).length || 0;

    return `
        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">🗂️ Heap Pages</span>
                <div class="btree-actions">
                    <button class="btn" onclick="selectTable('${currentTable}')">↻ Refresh</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Total Pages</div>
                    <div class="stat-value">${totalPages.toLocaleString()}</div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Pages with Dead Tuples</div>
                    <div class="stat-value ${pagesWithDead > 0 ? 'warning' : 'good'}">${pagesWithDead.toLocaleString()}</div>
                </div>
                <div class="stat-card" style="padding: 16px;">
                    <div class="stat-label">Total Size</div>
                    <div class="stat-value">${formatBytes(info.size)}</div>
                </div>
            </div>

            <div class="leaf-section">
                <div class="leaf-header">
                    <span class="leaf-title">Page Map (${totalPages} pages) - Click to inspect</span>
                    <div class="leaf-legend">
                        <div class="legend-item"><div class="legend-box full" style="background: var(--orange-500);"></div>Full (>80%)</div>
                        <div class="legend-item"><div class="legend-box partial" style="background: var(--orange-400);"></div>Partial (50-80%)</div>
                        <div class="legend-item"><div class="legend-box sparse" style="background: var(--orange-300);"></div>Sparse (<50%)</div>
                        <div class="legend-item"><div class="legend-box dead"></div>Has dead tuples</div>
                    </div>
                </div>
                <div class="leaf-grid-wrapper">
                    <div class="leaf-grid">
                        ${renderHeapPageGrid(pageMap.pages || [])}
                    </div>
                </div>
            </div>

            <!-- Page density distribution -->
            <div style="margin-top: 24px; padding: 20px; background: var(--bg-primary); border-radius: 12px;">
                <div style="font-weight: 600; margin-bottom: 16px;">Density Distribution</div>
                ${renderHeapDensityHistogram(pageMap.pages || [])}
            </div>
        </div>

        <div id="heapPageDetailPanel"></div>
    `;
}

function renderHeapPageGrid(pages) {
    const maxShow = 200;
    const pagesToShow = pages.slice(0, maxShow);

    let html = pagesToShow.map(p => {
        const hasDeadTuples = p.deadTuples > 0;

        // Determine color based on density
        let bgColor;
        if (hasDeadTuples) {
            bgColor = '#ef4444'; // red-500
        } else if (p.density >= 80) {
            bgColor = '#f97316'; // orange-500
        } else if (p.density >= 50) {
            bgColor = '#fb923c'; // orange-400
        } else if (p.density >= 20) {
            bgColor = '#fdba74'; // orange-300
        } else {
            bgColor = '#fed7aa'; // orange-200
        }

        return `<div class="leaf-page ${selectedPage === p.blockNo ? 'selected' : ''}"
                     style="background: ${bgColor} !important; ${hasDeadTuples ? 'opacity: 0.6;' : ''}"
                     onclick="loadHeapPage(${p.blockNo})"
                     title="Page ${p.blockNo}: ${p.density.toFixed(1)}% density, ${p.liveTuples} live, ${p.deadTuples} dead"></div>`;
    }).join('');

    if (pages.length > maxShow) {
        html += `<div style="padding: 8px; color: var(--text-muted); font-size: 0.75rem;">+${pages.length - maxShow} more pages</div>`;
    }

    return html;
}

function renderHeapDensityHistogram(pages) {
    const buckets = [
        { label: '0-20%', min: 0, max: 20, count: 0, color: 'var(--red-500)' },
        { label: '20-40%', min: 20, max: 40, count: 0, color: 'var(--orange-500)' },
        { label: '40-60%', min: 40, max: 60, count: 0, color: 'var(--yellow-500)' },
        { label: '60-80%', min: 60, max: 80, count: 0, color: 'var(--orange-400)' },
        { label: '80-100%', min: 80, max: 100, count: 0, color: 'var(--orange-500)' },
    ];

    pages.forEach(p => {
        for (const b of buckets) {
            if (p.density >= b.min && p.density < b.max) {
                b.count++;
                break;
            }
            if (b.max === 100 && p.density >= 80) {
                b.count++;
                break;
            }
        }
    });

    const maxCount = Math.max(...buckets.map(b => b.count), 1);

    return `
        <div style="display: flex; align-items: flex-end; gap: 8px; height: 120px;">
            ${buckets.map(b => `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <div style="width: 100%; background: ${b.color}; border-radius: 4px 4px 0 0; height: ${(b.count / maxCount * 100).toFixed(0)}px; min-height: ${b.count > 0 ? '4px' : '0'}; transition: height 0.3s ease;"></div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; color: var(--text-secondary);">${b.count}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted);">${b.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTableStorageTab() {
    return `
        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">📦 Heap Page Storage Layout</span>
            </div>

            <div style="padding: 20px; background: var(--bg-primary); border-radius: 12px; margin-bottom: 24px;">
                <p style="color: var(--text-secondary); margin-bottom: 16px;">
                    PostgreSQL stores table data in 8KB heap pages. Each page has a header, line pointers (growing downward),
                    free space in the middle, and tuple data (growing upward from the bottom).
                </p>
                <p style="color: var(--text-muted); font-size: 0.9rem;">
                    Click on a page in the <a href="#" onclick="switchTableTab('pages'); return false;" style="color: var(--cyan-400);">Pages tab</a>
                    to see its detailed memory layout with all tuples.
                </p>
            </div>

            <!-- Static page layout diagram -->
            <div style="background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-tertiary) 100%); border: 3px solid var(--orange-500); border-radius: 16px; padding: 24px;">
                <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 20px; text-align: center;">8KB Heap Page Structure</div>

                <div style="display: flex; flex-direction: column; gap: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem;">
                    <!-- Page Header -->
                    <div style="background: linear-gradient(90deg, var(--purple-500), var(--purple-400)); padding: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: white; font-weight: 700;">Page Header</span>
                        <span style="color: rgba(255,255,255,0.8); font-size: 0.75rem;">24 bytes (pd_lsn, pd_checksum, pd_flags, pd_lower, pd_upper, pd_special)</span>
                    </div>

                    <!-- Line Pointers -->
                    <div style="background: linear-gradient(90deg, var(--cyan-500), var(--cyan-400)); padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="color: white; font-weight: 700;">Line Pointers Array</span>
                            <span style="color: rgba(255,255,255,0.7); font-size: 0.75rem; margin-left: 8px;">↓ grows down</span>
                        </div>
                        <span style="color: rgba(255,255,255,0.8); font-size: 0.75rem;">4 bytes each (lp_off, lp_flags, lp_len)</span>
                    </div>

                    <!-- pd_lower marker -->
                    <div style="background: var(--bg-tertiary); padding: 8px 16px; border-left: 4px solid var(--cyan-400); font-size: 0.75rem; color: var(--cyan-400);">
                        ← pd_lower (end of line pointers)
                    </div>

                    <!-- Free Space -->
                    <div style="background: repeating-linear-gradient(45deg, var(--bg-secondary), var(--bg-secondary) 10px, var(--bg-tertiary) 10px, var(--bg-tertiary) 20px); padding: 40px 16px; border-radius: 8px; text-align: center;">
                        <span style="color: var(--text-muted); font-weight: 600;">FREE SPACE</span>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Available for new tuples</div>
                    </div>

                    <!-- pd_upper marker -->
                    <div style="background: var(--bg-tertiary); padding: 8px 16px; border-left: 4px solid var(--orange-400); font-size: 0.75rem; color: var(--orange-400);">
                        ← pd_upper (start of tuple data)
                    </div>

                    <!-- Tuples -->
                    <div style="background: linear-gradient(90deg, var(--orange-500), var(--orange-400)); padding: 12px 16px; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div>
                                <span style="color: white; font-weight: 700;">Tuple Data</span>
                                <span style="color: rgba(255,255,255,0.7); font-size: 0.75rem; margin-left: 8px;">↑ grows up</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; color: white;">
                                <div style="font-weight: 600;">Tuple N (newest)</div>
                                <div style="opacity: 0.8;">t_xmin | t_xmax | t_ctid | data...</div>
                            </div>
                            <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; color: white;">
                                <div style="font-weight: 600;">...</div>
                            </div>
                            <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; font-size: 0.75rem; color: white;">
                                <div style="font-weight: 600;">Tuple 1 (oldest)</div>
                                <div style="opacity: 0.8;">t_xmin | t_xmax | t_ctid | data...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Special area -->
                    <div style="background: var(--bg-secondary); padding: 8px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px dashed var(--border-light);">
                        <span style="color: var(--text-muted);">Special Area (pd_special)</span>
                        <span style="color: var(--text-muted); font-size: 0.75rem;">Usually empty for heap pages</span>
                    </div>
                </div>
            </div>

            <!-- TID explanation -->
            <div class="bloat-panel animate-in" style="margin-top: 24px;">
                <div class="bloat-header">
                    <span class="bloat-icon">🔗</span>
                    <span class="bloat-title">Understanding TIDs (Tuple Identifiers)</span>
                </div>
                <div style="padding: 16px; background: var(--bg-primary); border-radius: 8px;">
                    <p style="color: var(--text-secondary); margin-bottom: 12px;">
                        Every row in PostgreSQL has a physical location called a <strong style="color: var(--cyan-400);">TID (ctid)</strong> in the format <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">(page_number, item_offset)</code>.
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--orange-400); margin-bottom: 4px;">Example: (220, 57)</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">
                                Go to <strong>page 220</strong>, then look at <strong>line pointer 57</strong> to find the tuple offset.
                            </div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--green-400); margin-bottom: 4px;">Index → Heap Link</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">
                                B-tree index entries store TIDs that point directly to heap tuple locations.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Row vs Tuple explanation -->
            <div class="bloat-panel animate-in" style="margin-top: 24px;">
                <div class="bloat-header">
                    <span class="bloat-icon">📝</span>
                    <span class="bloat-title">Row vs Tuple: Understanding the Difference</span>
                </div>
                <div style="padding: 16px; background: var(--bg-primary); border-radius: 8px;">
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        In PostgreSQL, <strong style="color: var(--cyan-400);">row</strong> and <strong style="color: var(--orange-400);">tuple</strong> are related but distinct concepts:
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div style="background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%); padding: 16px; border-radius: 8px; border-left: 4px solid var(--cyan-400);">
                            <div style="font-weight: 700; color: var(--cyan-400); margin-bottom: 8px; font-size: 1.1rem;">Row (Logical)</div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                                A <strong>row</strong> is the logical representation of your data — what you see when you run a SELECT query.
                                It represents the <em>current</em> state of a record.
                            </div>
                            <div style="margin-top: 12px; background: var(--bg-primary); padding: 8px 12px; border-radius: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem;">
                                <span style="color: var(--purple-400);">SELECT</span> * <span style="color: var(--purple-400);">FROM</span> users;<br/>
                                <span style="color: var(--text-muted);">-- Returns rows (current data)</span>
                            </div>
                        </div>
                        <div style="background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%); padding: 16px; border-radius: 8px; border-left: 4px solid var(--orange-400);">
                            <div style="font-weight: 700; color: var(--orange-400); margin-bottom: 8px; font-size: 1.1rem;">Tuple (Physical)</div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
                                A <strong>tuple</strong> is the physical representation stored on disk.
                                Due to MVCC, one logical row may have <em>multiple</em> tuple versions.
                            </div>
                            <div style="margin-top: 12px; background: var(--bg-primary); padding: 8px 12px; border-radius: 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem;">
                                <span style="color: var(--text-muted);">-- Same row, multiple tuples:</span><br/>
                                Tuple v1: xmax=100 <span style="color: var(--red-400);">(dead)</span><br/>
                                Tuple v2: xmin=100 <span style="color: var(--green-400);">(live)</span>
                            </div>
                        </div>
                    </div>
                    <div style="background: var(--bg-secondary); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-light);">
                        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Why Does This Matter?</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
                            When you UPDATE a row, PostgreSQL doesn't modify the existing tuple in place. Instead, it creates a <strong>new tuple</strong>
                            with the updated data and marks the old tuple as dead. This is how <strong>MVCC (Multi-Version Concurrency Control)</strong> works —
                            allowing concurrent transactions to see consistent snapshots without blocking each other.
                            The dead tuples are later cleaned up by <strong>VACUUM</strong>.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tuple anatomy explanation -->
            <div class="bloat-panel animate-in" style="margin-top: 24px;">
                <div class="bloat-header">
                    <span class="bloat-icon">🔬</span>
                    <span class="bloat-title">Anatomy of a Tuple</span>
                </div>
                <div style="padding: 16px; background: var(--bg-primary); border-radius: 8px;">
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        Every tuple in PostgreSQL consists of a <strong>header</strong> (at least 23 bytes) followed by the actual <strong>user data</strong>.
                        The header contains metadata crucial for MVCC and data integrity.
                    </p>

                    <!-- Tuple structure diagram -->
                    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">Tuple Header Structure</div>
                        <div style="display: flex; flex-direction: column; gap: 3px; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem;">
                            <div style="display: flex; gap: 3px;">
                                <div style="background: var(--purple-500); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: white;">
                                    <div style="font-weight: 600;">t_xmin</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">4 bytes</div>
                                </div>
                                <div style="background: var(--purple-400); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: white;">
                                    <div style="font-weight: 600;">t_xmax</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">4 bytes</div>
                                </div>
                                <div style="background: var(--cyan-500); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: white;">
                                    <div style="font-weight: 600;">t_cid</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">4 bytes</div>
                                </div>
                                <div style="background: var(--cyan-400); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: white;">
                                    <div style="font-weight: 600;">t_ctid</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">6 bytes</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 3px;">
                                <div style="background: var(--green-500); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: white;">
                                    <div style="font-weight: 600;">t_infomask2</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">2 bytes</div>
                                </div>
                                <div style="background: var(--green-400); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: white;">
                                    <div style="font-weight: 600;">t_infomask</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">2 bytes</div>
                                </div>
                                <div style="background: var(--yellow-500); padding: 10px; border-radius: 4px; flex: 1; text-align: center; color: #000;">
                                    <div style="font-weight: 600;">t_hoff</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">1 byte</div>
                                </div>
                                <div style="background: var(--orange-500); padding: 10px; border-radius: 4px; flex: 2; text-align: center; color: white;">
                                    <div style="font-weight: 600;">User Data (columns)</div>
                                    <div style="font-size: 0.7rem; opacity: 0.8;">variable length</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Field explanations -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--purple-400); margin-bottom: 4px;">t_xmin (Insert XID)</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                Transaction ID that <strong>inserted</strong> this tuple. Used to determine visibility — only transactions
                                started after this XID committed can see this tuple.
                            </div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--purple-400); margin-bottom: 4px;">t_xmax (Delete XID)</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                Transaction ID that <strong>deleted or updated</strong> this tuple. If 0, the tuple is live.
                                Non-zero means this tuple version is no longer current.
                            </div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--cyan-400); margin-bottom: 4px;">t_ctid (Current TID)</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                Points to itself if this is the latest version. Otherwise, points to the <strong>next version</strong>
                                of this row — forming a chain for HOT updates.
                            </div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--green-400); margin-bottom: 4px;">t_infomask (Flags)</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                Bit flags indicating tuple state: <code style="background: var(--bg-tertiary); padding: 1px 4px; border-radius: 2px;">HEAP_XMIN_COMMITTED</code>,
                                <code style="background: var(--bg-tertiary); padding: 1px 4px; border-radius: 2px;">HEAP_HOT_UPDATED</code>, NULL bitmap info, etc.
                            </div>
                        </div>
                    </div>

                    <!-- MVCC example -->
                    <div style="margin-top: 16px; background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%); padding: 16px; border-radius: 8px; border: 1px solid var(--border-light);">
                        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Example: UPDATE Creates a New Tuple</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; line-height: 1.8;">
                            <div style="color: var(--text-muted); margin-bottom: 8px;">-- Initial INSERT (Transaction 100)</div>
                            <div style="background: var(--bg-primary); padding: 8px 12px; border-radius: 4px; margin-bottom: 8px; border-left: 3px solid var(--green-400);">
                                <span style="color: var(--purple-400);">INSERT INTO</span> users (name) <span style="color: var(--purple-400);">VALUES</span> ('Alice');<br/>
                                <span style="color: var(--text-muted);">→ Tuple created: xmin=100, xmax=0, ctid=(0,1)</span>
                            </div>
                            <div style="color: var(--text-muted); margin-bottom: 8px;">-- UPDATE (Transaction 150)</div>
                            <div style="background: var(--bg-primary); padding: 8px 12px; border-radius: 4px; border-left: 3px solid var(--orange-400);">
                                <span style="color: var(--purple-400);">UPDATE</span> users <span style="color: var(--purple-400);">SET</span> name = 'Alicia' <span style="color: var(--purple-400);">WHERE</span> name = 'Alice';<br/>
                                <span style="color: var(--text-muted);">→ Old tuple: xmin=100, <span style="color: var(--red-400);">xmax=150</span>, ctid=<span style="color: var(--cyan-400);">(0,2)</span> <span style="color: var(--red-400);">(dead)</span></span><br/>
                                <span style="color: var(--text-muted);">→ New tuple: xmin=150, xmax=0, ctid=(0,2) <span style="color: var(--green-400);">(live)</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Line Pointers explanation -->
            <div class="bloat-panel animate-in" style="margin-top: 24px;">
                <div class="bloat-header">
                    <span class="bloat-icon">👆</span>
                    <span class="bloat-title">Line Pointers: The Indirection Layer</span>
                </div>
                <div style="padding: 16px; background: var(--bg-primary); border-radius: 8px;">
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        Line pointers provide a level of <strong>indirection</strong> between TIDs and actual tuple data.
                        This design enables efficient HOT updates and tuple compaction without changing TIDs.
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--cyan-400); margin-bottom: 8px;">Each Line Pointer Contains:</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.8;">
                                <div><strong style="color: var(--text-secondary);">lp_off</strong> — Byte offset to tuple (15 bits)</div>
                                <div><strong style="color: var(--text-secondary);">lp_flags</strong> — Status flags (2 bits)</div>
                                <div><strong style="color: var(--text-secondary);">lp_len</strong> — Tuple length in bytes (15 bits)</div>
                            </div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--cyan-400); margin-bottom: 8px;">Line Pointer States:</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.8;">
                                <div><span style="color: var(--green-400);">LP_NORMAL</span> — Points to a valid tuple</div>
                                <div><span style="color: var(--orange-400);">LP_REDIRECT</span> — Points to another LP (HOT)</div>
                                <div><span style="color: var(--red-400);">LP_DEAD</span> — Can be reused</div>
                                <div><span style="color: var(--text-muted);">LP_UNUSED</span> — Never used</div>
                            </div>
                        </div>
                    </div>
                    <div style="background: var(--bg-secondary); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-light);">
                        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Why Indirection?</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
                            Index entries store TIDs like <code style="background: var(--bg-tertiary); padding: 1px 4px; border-radius: 2px;">(page, line_pointer)</code>.
                            When a tuple is updated via <strong>HOT</strong> (Heap-Only Tuple), the new tuple stays on the same page and the line pointer
                            can be updated to point to the new location — <em>without updating any indexes</em>. This is a major performance optimization.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="heapPageDetailPanel"></div>
    `;
}

// Load and display heap page details
async function loadHeapPage(blockNo) {
    selectedPage = blockNo;

    // Update page grid selection
    document.querySelectorAll('.leaf-page').forEach(el => {
        el.classList.toggle('selected', el.onclick?.toString().includes(`(${blockNo})`));
    });

    const panel = document.getElementById('heapPageDetailPanel');
    if (!panel) return;

    panel.innerHTML = `
        <div class="page-detail animate-in">
            <div class="loading">
                <div class="loading-spinner"></div>
                Loading page ${blockNo}...
            </div>
        </div>`;

    try {
        const detail = await fetchAPI(`/api/table/${currentTable}/page/${blockNo}`);
        panel.innerHTML = renderHeapPageDetail(detail, blockNo);
    } catch (err) {
        panel.innerHTML = `
            <div class="page-detail">
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p>Failed to load page: ${err.message}</p>
                </div>
            </div>`;
    }
}

// Find and render ctid chains (HOT chains) on a page
function renderCtidChains(tuples, blockNo) {
    // Build a map of ctid targets -> source tuples
    // A chain exists when tuple.ctid points to another tuple on the same page
    const chains = [];
    const visited = new Set();

    // Parse ctid format "(page,item)" and find chains
    function parseCtid(ctid) {
        const match = ctid?.match(/\((\d+),(\d+)\)/);
        if (match) {
            return { page: parseInt(match[1]), item: parseInt(match[2]) };
        }
        return null;
    }

    // Find tuples that start chains (have ctid pointing elsewhere on same page)
    for (const tuple of tuples) {
        if (visited.has(tuple.lp)) continue;

        const target = parseCtid(tuple.ctid);
        // If ctid points to a different tuple on the same page, this is a chain
        if (target && target.page === blockNo && target.item !== tuple.lp) {
            // Build the chain
            const chain = [tuple.lp];
            visited.add(tuple.lp);

            let currentItem = target.item;
            let iterations = 0;
            const maxIterations = 20; // Prevent infinite loops

            while (iterations < maxIterations) {
                const nextTuple = tuples.find(t => t.lp === currentItem);
                if (!nextTuple || visited.has(nextTuple.lp)) break;

                chain.push(nextTuple.lp);
                visited.add(nextTuple.lp);

                const nextTarget = parseCtid(nextTuple.ctid);
                if (!nextTarget || nextTarget.page !== blockNo || nextTarget.item === nextTuple.lp) {
                    break; // End of chain
                }
                currentItem = nextTarget.item;
                iterations++;
            }

            if (chain.length > 1) {
                chains.push(chain);
            }
        }
    }

    if (chains.length === 0) {
        return ''; // No chains to display
    }

    // Render the chains visualization
    return `
        <div style="background: linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(139,92,246,0.1) 100%); border: 2px solid var(--purple-500); border-radius: 16px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <span style="font-size: 1.5rem;">🔗</span>
                <div>
                    <div style="font-weight: 700; font-size: 1rem; color: var(--purple-400);">HOT Chains Detected</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Tuples linked via ctid (same page updates)</div>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${chains.map((chain, idx) => `
                    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 16px;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">Chain ${idx + 1} (${chain.length} versions)</div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            ${chain.map((lp, i) => {
                                const tuple = tuples.find(t => t.lp === lp);
                                const isLast = i === chain.length - 1;
                                const isFirst = i === 0;
                                return `
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <div onclick="scrollToTuple(${lp})" style="cursor: pointer; padding: 8px 16px; background: ${!tuple?.isLive ? 'rgba(239,68,68,0.2)' : isLast ? 'rgba(34,197,94,0.2)' : 'rgba(168,85,247,0.2)'}; border: 2px solid ${!tuple?.isLive ? 'var(--red-400)' : isLast ? 'var(--green-400)' : 'var(--purple-400)'}; border-radius: 8px; transition: all 0.2s;">
                                            <div style="font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: ${!tuple?.isLive ? 'var(--red-400)' : isLast ? 'var(--green-400)' : 'var(--purple-400)'};">
                                                lp=${lp}
                                            </div>
                                            <div style="font-size: 0.65rem; color: var(--text-muted);">
                                                ${isFirst ? 'OLD' : isLast ? 'CURRENT' : `v${i + 1}`}
                                            </div>
                                            <div style="font-size: 0.6rem; color: var(--text-muted);">
                                                xmin: ${tuple?.xmin || '?'}
                                            </div>
                                        </div>
                                        ${!isLast ? '<span style="color: var(--purple-400); font-size: 1.2rem;">→</span>' : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div style="margin-top: 8px; font-size: 0.7rem; color: var(--text-muted);">
                            ${chain.length > 1 ? `Old versions will be removed by VACUUM when no longer visible to any transaction.` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top: 16px; padding: 12px; background: rgba(168,85,247,0.1); border-radius: 8px; font-size: 0.75rem; color: var(--text-secondary);">
                <strong>What is a HOT chain?</strong> When a non-indexed column is updated, PostgreSQL can keep the new tuple on the same page and link it via ctid. This avoids index updates and is called a Heap-Only Tuple (HOT) update.
            </div>
        </div>
    `;
}

// Scroll to a specific tuple on the page
function scrollToTuple(lp) {
    const element = document.getElementById(`tuple-${lp}`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.boxShadow = '0 0 20px var(--purple-400)';
        setTimeout(() => {
            element.style.boxShadow = '';
        }, 2000);
    }
}

function renderHeapPageDetail(detail, blockNo) {
    const { stats, tuples } = detail;
    const pageSize = 8192;
    const headerSize = 24;

    // Calculate live/dead counts
    const liveTuples = tuples.filter(t => t.isLive);
    const deadTuples = tuples.filter(t => !t.isLive);

    // Calculate space usage
    const linePointersSize = tuples.length * 4;
    const tuplesSize = tuples.reduce((sum, t) => sum + (t.itemLen || 0), 0);
    const freeSpace = pageSize - headerSize - linePointersSize - tuplesSize;
    const density = ((headerSize + linePointersSize + tuplesSize) / pageSize * 100);

    return `
        <div class="page-detail animate-in">
            <div class="page-detail-header">
                <div class="page-detail-title">
                    <span style="font-size: 1.5rem;">📦</span>
                    <span style="font-size: 1.3rem; font-weight: 800;">Heap Page ${blockNo}</span>
                    <span class="page-badge" style="background: var(--orange-500); font-size: 0.85rem; padding: 6px 14px;">Table: ${currentTable}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    ${blockNo > 0 ? `<button class="btn" onclick="loadHeapPage(${blockNo - 1})">← Page ${blockNo - 1}</button>` : ''}
                    <button class="btn" onclick="loadHeapPage(${blockNo + 1})">Page ${blockNo + 1} →</button>
                    <button class="btn" onclick="document.getElementById('heapPageDetailPanel').innerHTML = ''">✕</button>
                </div>
            </div>

            <!-- VISUAL MEMORY LAYOUT -->
            <div style="background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-tertiary) 100%); border: 3px solid var(--orange-500); border-radius: 16px; padding: 24px; margin-bottom: 24px; position: relative; overflow: hidden;">
                <div style="position: relative; z-index: 1;">
                    <!-- Page Size Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div style="font-size: 0.9rem; color: var(--text-muted);">8KB Heap Page (${pageSize.toLocaleString()} bytes)</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 2rem; font-weight: 800; color: ${density >= 70 ? 'var(--orange-400)' : density >= 40 ? 'var(--yellow-400)' : 'var(--red-400)'};">
                            ${density.toFixed(0)}% Full
                        </div>
                    </div>

                    <!-- Visual Bar Representation -->
                    <div style="background: var(--bg-primary); border-radius: 12px; height: 80px; display: flex; overflow: hidden; border: 2px solid var(--border-light); margin-bottom: 16px;">
                        <!-- Page Header -->
                        <div style="width: ${(headerSize / pageSize * 100).toFixed(1)}%; min-width: 30px; background: linear-gradient(180deg, var(--purple-500), var(--purple-400)); display: flex; align-items: center; justify-content: center; border-right: 2px solid var(--bg-primary);">
                            <span style="font-size: 0.6rem; color: white; font-weight: 700;">HDR</span>
                        </div>
                        <!-- Line Pointers -->
                        <div style="width: ${(linePointersSize / pageSize * 100).toFixed(1)}%; min-width: 20px; background: linear-gradient(180deg, var(--cyan-500), var(--cyan-400)); display: flex; align-items: center; justify-content: center; border-right: 2px solid var(--bg-primary);">
                            <span style="font-size: 0.55rem; color: white; font-weight: 600; writing-mode: ${linePointersSize > 100 ? 'horizontal-tb' : 'vertical-rl'}; transform: ${linePointersSize > 100 ? 'none' : 'rotate(180deg)'};">${tuples.length} LP</span>
                        </div>
                        <!-- Free Space -->
                        <div style="flex: ${freeSpace > 0 ? (freeSpace / pageSize).toFixed(2) : 0}; background: repeating-linear-gradient(45deg, var(--bg-tertiary), var(--bg-tertiary) 10px, var(--bg-secondary) 10px, var(--bg-secondary) 20px); display: flex; align-items: center; justify-content: center; border-right: 2px solid var(--bg-primary);">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${freeSpace > 0 ? `${freeSpace.toLocaleString()} FREE` : ''}</span>
                        </div>
                        <!-- Live Tuples -->
                        ${liveTuples.length > 0 ? `
                        <div style="width: ${(liveTuples.reduce((s, t) => s + (t.itemLen || 0), 0) / pageSize * 100).toFixed(1)}%; background: linear-gradient(180deg, var(--orange-500), var(--orange-400)); display: flex; align-items: center; justify-content: center; border-right: ${deadTuples.length > 0 ? '2px solid var(--bg-primary)' : 'none'};">
                            <span style="font-size: 0.75rem; color: white; font-weight: 700;">${liveTuples.length} LIVE</span>
                        </div>` : ''}
                        <!-- Dead Tuples -->
                        ${deadTuples.length > 0 ? `
                        <div style="width: ${(deadTuples.reduce((s, t) => s + (t.itemLen || 0), 0) / pageSize * 100).toFixed(1)}%; background: repeating-linear-gradient(45deg, var(--red-500), var(--red-500) 10px, var(--red-400) 10px, var(--red-400) 20px); display: flex; align-items: center; justify-content: center;">
                            <span style="font-size: 0.75rem; color: white; font-weight: 700; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${deadTuples.length} DEAD</span>
                        </div>` : ''}
                    </div>

                    <!-- Stats Row -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Live Tuples</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.2rem; font-weight: 700; color: var(--orange-400);">${liveTuples.length}</div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Dead Tuples</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.2rem; font-weight: 700; color: ${deadTuples.length > 0 ? 'var(--red-400)' : 'var(--text-muted)'};">${deadTuples.length}</div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Free Space</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.2rem; font-weight: 700; color: var(--text-secondary);">${formatBytes(freeSpace)}</div>
                        </div>
                        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Line Pointers</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1.2rem; font-weight: 700; color: var(--cyan-400);">${tuples.length}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CTID CHAIN VISUALIZATION -->
            ${renderCtidChains(tuples, blockNo)}

            <!-- TUPLES DETAIL -->
            <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-weight: 700; font-size: 1rem;">Heap Tuples</div>
                    <div style="display: flex; gap: 16px; font-size: 0.8rem;">
                        <span style="color: var(--orange-400);">● ${liveTuples.length} live</span>
                        ${deadTuples.length > 0 ? `<span style="color: var(--red-400);">● ${deadTuples.length} dead</span>` : ''}
                    </div>
                </div>

                <!-- Tuple Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; max-height: 600px; overflow-y: auto; padding: 4px;">
                    ${tuples.slice(0, 50).map((tuple, idx) => {
                        const isHighlighted = highlightTID && highlightTID.page === blockNo && highlightTID.item === tuple.lp;
                        return `
                        <div id="tuple-${tuple.lp}" style="background: ${!tuple.isLive ? 'rgba(239,68,68,0.15)' : isHighlighted ? 'rgba(34,211,238,0.2)' : 'var(--bg-tertiary)'}; border: 2px solid ${!tuple.isLive ? 'var(--red-500)' : isHighlighted ? 'var(--cyan-400)' : 'var(--orange-500)'}; border-radius: 12px; overflow: hidden; ${isHighlighted ? 'animation: pulse 1s ease-in-out 3;' : ''}">
                            <!-- Tuple Header -->
                            <div style="padding: 10px 14px; background: ${!tuple.isLive ? 'rgba(239,68,68,0.2)' : isHighlighted ? 'rgba(34,211,238,0.15)' : 'rgba(249,115,22,0.15)'}; border-bottom: 1px solid ${!tuple.isLive ? 'var(--red-500)' : isHighlighted ? 'var(--cyan-400)' : 'var(--orange-500)'}; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <span style="font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; font-weight: 700; color: ${!tuple.isLive ? 'var(--red-400)' : 'var(--orange-400)'};">lp=${tuple.lp}</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px;">${tuple.lpFlagsStr}</span>
                                </div>
                                <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--cyan-400);" title="TID: (${blockNo},${tuple.lp})">(${blockNo},${tuple.lp})</div>
                            </div>

                            <!-- Tuple Body -->
                            <div style="padding: 12px 14px;">
                                <!-- MVCC Info -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                                    <div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px;">
                                        <div style="font-size: 0.65rem; color: var(--text-muted);">xmin (insert)</div>
                                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: var(--green-400);">${tuple.xmin}</div>
                                    </div>
                                    <div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px;">
                                        <div style="font-size: 0.65rem; color: var(--text-muted);">xmax (delete)</div>
                                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: ${tuple.xmax > 0 ? 'var(--red-400)' : 'var(--text-muted)'};">${tuple.xmax || '−'}</div>
                                    </div>
                                </div>

                                <!-- ctid (physical location) -->
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-size: 0.7rem; color: var(--text-muted);">ctid (next version)</span>
                                    ${(() => {
                                        const ctidMatch = tuple.ctid?.match(/\((\d+),(\d+)\)/);
                                        const ctidPage = ctidMatch ? parseInt(ctidMatch[1]) : null;
                                        const ctidItem = ctidMatch ? parseInt(ctidMatch[2]) : null;
                                        const pointsToSelf = tuple.ctid === `(${blockNo},${tuple.lp})`;
                                        const pointsToSamePage = ctidPage === blockNo && !pointsToSelf;

                                        if (pointsToSamePage) {
                                            return `<span onclick="scrollToTuple(${ctidItem})" style="cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--purple-400); text-decoration: underline; text-decoration-style: dotted;" title="Click to jump to lp=${ctidItem}">${tuple.ctid} →</span>`;
                                        } else if (!pointsToSelf && ctidPage !== null) {
                                            return `<span onclick="loadHeapPage(${ctidPage})" style="cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--cyan-400); text-decoration: underline; text-decoration-style: dotted;" title="Click to go to page ${ctidPage}">${tuple.ctid}</span>`;
                                        } else {
                                            return `<span style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--text-muted);">${tuple.ctid}</span>`;
                                        }
                                    })()}
                                </div>

                                <!-- Size -->
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-size: 0.7rem; color: var(--text-muted);">Size</span>
                                    <span style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--text-secondary);">${tuple.itemLen} bytes</span>
                                </div>

                                <!-- Flags/State -->
                                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">
                                    ${!tuple.isLive ? '<span style="background: var(--red-500); color: white; font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">DEAD</span>' : ''}
                                    ${tuple.isHot ? '<span style="background: var(--purple-500); color: white; font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">HOT</span>' : ''}
                                    ${tuple.isUpdated ? '<span style="background: var(--yellow-500); color: black; font-size: 0.6rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">UPDATED</span>' : ''}
                                    ${tuple.infoMask?.includes('HEAP_XMIN_COMMITTED') ? '<span style="background: var(--green-600); color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px;">COMMITTED</span>' : ''}
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>

                ${tuples.length > 50 ? `
                <div style="margin-top: 16px; padding: 20px; background: var(--bg-primary); border-radius: 12px; text-align: center;">
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px;">+${tuples.length - 50} more tuples</div>
                </div>` : ''}
            </div>
        </div>
    `;
}

function switchTableTab(tab) {
    currentTab = tab;
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
        const tabName = btn.textContent.toLowerCase().replace(' ', '');
        btn.classList.toggle('active', tabName.includes(tab) || (tab === 'storage' && btn.textContent.includes('Storage')));
    });
    // Re-render content
    renderTableTabContent();
}

// ==================== HOT UPDATE DEMO ====================

let demoRowData = null;
let demoResult = null;
let demoIndexInfo = null; // Cached indexed columns info for current table

async function loadDemoIndexInfo() {
    if (!currentTable) return null;
    try {
        demoIndexInfo = await fetchAPI(`/api/table/${currentTable}/indexed-columns`);
        return demoIndexInfo;
    } catch (err) {
        console.error('Failed to load indexed columns:', err);
        return null;
    }
}

function renderDemoTab() {
    // If we don't have index info yet, show loading and fetch it
    if (!demoIndexInfo) {
        loadDemoIndexInfo().then(() => renderTableTabContent());
        return `<div class="btree-container animate-in"><div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading column information...</div></div>`;
    }

    const { pkColumn, indexedColumns, nonIndexedColumns, columnTypes, indexDetails } = demoIndexInfo;

    // Check if table has a PK
    if (!pkColumn) {
        return `
            <div class="btree-container animate-in">
                <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid var(--red-500); border-radius: 12px; padding: 20px; text-align: center;">
                    <div style="color: var(--red-400); font-weight: 600; margin-bottom: 8px;">No Primary Key</div>
                    <div style="color: var(--text-secondary);">The HOT demo requires a table with a primary key to locate rows.</div>
                </div>
            </div>
        `;
    }

    // Check if there are non-indexed columns (needed for HOT demo)
    const hasNonIndexed = nonIndexedColumns && nonIndexedColumns.length > 0;

    return `
        <div class="btree-container animate-in">
            <div class="btree-header">
                <span class="btree-title">🧪 HOT Update Demo</span>
            </div>

            <!-- Warning banner -->
            <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid var(--yellow-500); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <span style="color: var(--yellow-400);">⚠️</span>
                <span style="color: var(--text-secondary); font-size: 0.85rem;">This demo executes real UPDATE queries on table <strong>${currentTable}</strong>.</span>
            </div>

            <div style="background: var(--bg-primary); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="color: var(--text-secondary); margin-bottom: 12px;">
                    This demo shows the difference between <strong style="color: var(--orange-400);">HOT (Heap-Only Tuple)</strong> updates
                    and <strong style="color: var(--blue-400);">regular updates</strong> in PostgreSQL.
                </p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 0.85rem;">
                    <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; border-left: 3px solid var(--orange-500);">
                        <strong style="color: var(--orange-400);">🔥 HOT Update</strong>
                        <p style="color: var(--text-muted); margin-top: 4px;">Update a <em>non-indexed</em> column. New tuple stays on same page, no index update needed.</p>
                    </div>
                    <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; border-left: 3px solid var(--blue-500);">
                        <strong style="color: var(--blue-400);">📦 Regular Update</strong>
                        <p style="color: var(--text-muted); margin-top: 4px;">Update an <em>indexed</em> column. Index must be updated to point to new tuple location.</p>
                    </div>
                </div>
            </div>

            <!-- Column info -->
            <div style="background: var(--bg-primary); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">Table columns:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${indexedColumns.map(col => `
                        <span style="background: rgba(59, 130, 246, 0.2); color: var(--blue-400); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-family: 'IBM Plex Mono', monospace;">
                            ${col} <span style="opacity: 0.7;">(${col === pkColumn ? 'PK' : indexDetails[col] || 'idx'})</span>
                        </span>
                    `).join('')}
                    ${nonIndexedColumns.map(col => `
                        <span style="background: rgba(249, 115, 22, 0.2); color: var(--orange-400); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-family: 'IBM Plex Mono', monospace;">
                            ${col} <span style="opacity: 0.7;">(no index)</span>
                        </span>
                    `).join('')}
                </div>
            </div>

            <!-- Step 1: Pick a row -->
            <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                <div style="font-weight: 600; margin-bottom: 12px;">Step 1: Pick a row</div>
                <div style="display: flex; gap: 12px; align-items: flex-end;">
                    <div style="flex: 1;">
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">Primary Key (${pkColumn})</label>
                        <input type="text" id="demoPK" placeholder="Enter ${pkColumn} value" value="${demoRowData?.pkValue || ''}"
                               style="width: 100%; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 8px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem;"
                               onkeypress="if(event.key==='Enter') loadDemoRow()">
                    </div>
                    <button class="btn" onclick="loadDemoRow()" style="padding: 10px 20px;">Load Row</button>
                    <button class="btn" onclick="loadRandomDemoRow()" style="padding: 10px 20px;">Random Row</button>
                </div>

                <div id="demoRowState" style="margin-top: 16px;">
                    ${demoRowData ? renderDemoRowState(demoRowData) : '<div style="color: var(--text-muted); font-size: 0.9rem;">Select a row to see its current state</div>'}
                </div>
            </div>

            <!-- Step 2: Choose update type -->
            ${demoRowData ? `
            <div style="display: grid; grid-template-columns: ${hasNonIndexed ? '1fr 1fr' : '1fr'}; gap: 16px; margin-bottom: 16px;">
                ${hasNonIndexed ? `
                <!-- HOT Update -->
                <div style="background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(249, 115, 22, 0.1) 100%); border: 2px solid var(--orange-500); border-radius: 12px; padding: 20px;">
                    <div style="font-weight: 700; color: var(--orange-400); margin-bottom: 12px;">🔥 HOT Update</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                        Update a non-indexed column (eligible for HOT)
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">Column to update</label>
                        <select id="demoHotColumn" onchange="updateDemoValueFromColumn('hot')" style="width: 100%; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--orange-500); border-radius: 8px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem;">
                            ${nonIndexedColumns.map(col => `<option value="${col}">${col} (${columnTypes[col]})</option>`).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">New value <span style="opacity: 0.6;">(current: <span id="demoHotCurrentVal">${demoRowData.columnData?.[nonIndexedColumns[0]] ?? 'null'}</span>)</span></label>
                        <input type="text" id="demoHotValue" placeholder="Enter new value" value="${demoRowData.columnData?.[nonIndexedColumns[0]] ?? ''}"
                               style="width: 100%; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--orange-500); border-radius: 8px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem;">
                    </div>
                    <button class="btn" onclick="executeDemoUpdate('hot')" style="width: 100%; background: var(--orange-500); border-color: var(--orange-500); color: white; padding: 12px;">
                        Execute HOT Update
                    </button>
                </div>
                ` : `
                <div style="background: rgba(251, 191, 36, 0.1); border: 2px dashed var(--yellow-500); border-radius: 12px; padding: 20px; text-align: center;">
                    <div style="color: var(--yellow-400); font-weight: 600; margin-bottom: 8px;">No Non-Indexed Columns</div>
                    <div style="color: var(--text-muted); font-size: 0.85rem;">All columns in this table are indexed, so HOT updates are not possible.</div>
                </div>
                `}

                <!-- Regular Update -->
                <div style="background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(59, 130, 246, 0.1) 100%); border: 2px solid var(--blue-500); border-radius: 12px; padding: 20px;">
                    <div style="font-weight: 700; color: var(--blue-400); margin-bottom: 12px;">📦 Regular Update</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                        Update an indexed column (requires index update)
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">Column to update</label>
                        <select id="demoRegularColumn" onchange="updateDemoValueFromColumn('regular')" style="width: 100%; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--blue-500); border-radius: 8px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem;">
                            ${indexedColumns.map(col => `<option value="${col}">${col} (${columnTypes[col]})${col === pkColumn ? ' - PK' : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px;">New value <span style="opacity: 0.6;">(current: <span id="demoRegularCurrentVal">${demoRowData.columnData?.[indexedColumns[0]] ?? 'null'}</span>)</span></label>
                        <input type="text" id="demoRegularValue" placeholder="Enter new value" value="${demoRowData.columnData?.[indexedColumns[0]] ?? ''}"
                               style="width: 100%; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--blue-500); border-radius: 8px; color: var(--text-primary); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem;">
                    </div>
                    <button class="btn" onclick="executeDemoUpdate('regular')" style="width: 100%; background: var(--blue-500); border-color: var(--blue-500); color: white; padding: 12px;">
                        Execute Regular Update
                    </button>
                </div>
            </div>
            ` : ''}

            <!-- Step 3: Results -->
            <div id="demoResultPanel">
                ${demoResult ? renderDemoResult(demoResult) : ''}
            </div>
        </div>
    `;
}

function renderDemoRowState(data) {
    // Get column data - new format has columnData object
    const columnData = data.columnData || {};
    const pkColumn = data.pkColumn || 'id';

    // Build column display - show first few columns
    const columnEntries = Object.entries(columnData).slice(0, 4);
    const isIndexed = (col) => demoIndexInfo?.indexedColumns?.includes(col);

    return `
        <div style="background: var(--bg-primary); border: 2px solid var(--cyan-400); border-radius: 12px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-weight: 600; color: var(--cyan-400);">Current Row State</div>
                <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: var(--text-muted);">
                    TID: <span style="color: var(--cyan-400);">${data.tid}</span>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
                ${columnEntries.map(([col, val]) => {
                    const indexed = isIndexed(col);
                    const isPK = col === pkColumn;
                    const label = isPK ? `${col} (PK)` : indexed ? `${col} (indexed)` : `${col}`;
                    const color = indexed ? 'var(--blue-400)' : 'var(--orange-400)';
                    const displayVal = val != null ? String(val) : '(null)';
                    const truncated = displayVal.length > 25 ? displayVal.substring(0, 25) + '...' : displayVal;
                    return `
                        <div style="background: var(--bg-secondary); padding: 10px; border-radius: 8px;">
                            <div style="font-size: 0.65rem; color: var(--text-muted);">${label}</div>
                            <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: ${color}; word-break: break-all;">${truncated}</div>
                        </div>
                    `;
                }).join('')}
                <div style="background: var(--bg-secondary); padding: 10px; border-radius: 8px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted);">Page</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--text-primary);">${data.page}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px; border-radius: 8px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted);">Item</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--text-primary);">${data.item}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px; border-radius: 8px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted);">xmin</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--green-400);">${data.xmin}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px; border-radius: 8px;">
                    <div style="font-size: 0.65rem; color: var(--text-muted);">xmax</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: ${data.xmax ? 'var(--red-400)' : 'var(--text-muted)'};">${data.xmax || '0'}</div>
                </div>
            </div>
        </div>
    `;
}

function renderDemoResult(result) {
    if (!result.success) {
        return `
            <div style="background: rgba(239, 68, 68, 0.1); border: 2px solid var(--red-500); border-radius: 12px; padding: 20px;">
                <div style="color: var(--red-400); font-weight: 600;">❌ Error</div>
                <div style="color: var(--text-secondary); margin-top: 8px;">${result.error}</div>
            </div>
        `;
    }

    const isHot = result.updateType === 'hot';
    const borderColor = isHot ? 'var(--orange-500)' : 'var(--blue-500)';
    const bgGradient = isHot ? 'rgba(249, 115, 22, 0.1)' : 'rgba(59, 130, 246, 0.1)';
    const icon = isHot ? '🔥' : '📦';
    const title = isHot ? 'HOT UPDATE' : 'REGULAR UPDATE';

    return `
        <div style="background: linear-gradient(135deg, var(--bg-secondary) 0%, ${bgGradient} 100%); border: 3px solid ${borderColor}; border-radius: 16px; padding: 24px; animation: fadeIn 0.5s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <div style="font-size: 1.3rem; font-weight: 800; color: ${isHot ? 'var(--orange-400)' : 'var(--blue-400)'};">
                        ${icon} ${title} ${result.samePage ? '(Same Page!)' : '(Different Page)'}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                        Column: <code>${result.column}</code> •
                        "${result.oldValue}" → "${result.newValue}"
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn" onclick="viewDemoPage(${result.before.page})">View Page ${result.before.page}</button>
                    ${result.newTuple && result.newTuple.page !== result.before.page ?
                        `<button class="btn" onclick="viewDemoPage(${result.newTuple.page})">View Page ${result.newTuple.page}</button>` : ''}
                </div>
            </div>

            <!-- Before/After Comparison -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; margin-bottom: 20px;">
                <!-- Before -->
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 16px;">
                    <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 12px;">BEFORE</div>
                    <div style="display: grid; gap: 8px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">TID</span>
                            <span style="font-family: 'IBM Plex Mono', monospace; color: var(--cyan-400);">${result.before.tid}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">ctid</span>
                            <span style="font-family: 'IBM Plex Mono', monospace;">${result.before.ctid}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">xmax</span>
                            <span style="font-family: 'IBM Plex Mono', monospace; color: var(--green-400);">${result.before.xmax || '0 (live)'}</span>
                        </div>
                    </div>
                </div>

                <!-- Arrow -->
                <div style="display: flex; align-items: center; font-size: 2rem; color: var(--text-muted);">→</div>

                <!-- After (old tuple state) -->
                <div style="background: var(--bg-primary); border-radius: 12px; padding: 16px; border: 2px solid var(--red-500);">
                    <div style="font-weight: 600; color: var(--red-400); margin-bottom: 12px;">OLD TUPLE (now dead)</div>
                    <div style="display: grid; gap: 8px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">TID</span>
                            <span style="font-family: 'IBM Plex Mono', monospace; color: var(--cyan-400);">${result.after.tid}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">ctid</span>
                            <span style="font-family: 'IBM Plex Mono', monospace; color: ${result.after.ctid !== result.after.tid ? 'var(--purple-400)' : 'var(--text-secondary)'};">
                                ${result.after.ctid} ${result.after.ctid !== result.after.tid ? '→ new' : ''}
                            </span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">xmax</span>
                            <span style="font-family: 'IBM Plex Mono', monospace; color: var(--red-400);">${result.after.xmax} (dead)</span>
                        </div>
                        ${result.after.infoMask?.includes('HEAP_HOT_UPDATED') ? `
                        <div style="margin-top: 8px;">
                            <span style="background: var(--orange-500); color: white; font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 4px;">HEAP_HOT_UPDATED</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- New Tuple -->
            ${result.newTuple ? `
            <div style="background: var(--bg-primary); border: 2px solid var(--green-500); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <div style="font-weight: 600; color: var(--green-400); margin-bottom: 12px;">✨ NEW TUPLE</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                    <div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">TID</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--cyan-400);">${result.newTuple.tid}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">Page</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: ${result.samePage ? 'var(--green-400)' : 'var(--yellow-400)'};">
                            ${result.newTuple.page} ${result.samePage ? '(same!)' : '(moved)'}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">Item</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem;">${result.newTuple.item}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">xmin</div>
                        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--green-400);">${result.newTuple.xmin}</div>
                    </div>
                </div>
                ${result.newTuple.infoMask?.includes('HEAP_ONLY_TUPLE') ? `
                <div style="margin-top: 12px;">
                    <span style="background: var(--purple-500); color: white; font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 4px;">HEAP_ONLY_TUPLE</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">Index doesn't point here - follows HOT chain</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <!-- Explanation -->
            <div style="background: var(--bg-tertiary); border-radius: 12px; padding: 16px;">
                <div style="font-weight: 600; margin-bottom: 8px;">💡 What happened?</div>
                <div style="color: var(--text-secondary); line-height: 1.6;">${result.explanation}</div>
            </div>

            <!-- Actions -->
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button class="btn" onclick="loadDemoRow()" style="flex: 1;">🔄 Load Updated Row</button>
                <button class="btn" onclick="clearDemoResult()" style="flex: 1;">Clear Result</button>
            </div>
        </div>
    `;
}

async function loadDemoRow() {
    const pk = document.getElementById('demoPK')?.value?.trim();
    if (!pk) {
        alert('Please enter a primary key value');
        return;
    }

    try {
        const result = await fetchAPI(`/api/table/${currentTable}/demo/row?pk=${encodeURIComponent(pk)}`);
        if (result.found) {
            demoRowData = result;
            demoResult = null;
            renderTableTabContent();
        } else {
            alert('Row not found');
        }
    } catch (err) {
        alert('Error loading row: ' + err.message);
    }
}

async function loadRandomDemoRow() {
    try {
        // Get a random row from the current table
        const tables = await fetchAPI('/api/tables');
        const targetTable = tables.find(t => t.name === currentTable);
        if (!targetTable || targetTable.rowCount === 0) {
            alert('Table is empty');
            return;
        }

        // Pick a random page and get a row from it
        const pageMap = await fetchAPI(`/api/table/${currentTable}/pages`);
        if (pageMap.pages.length === 0) {
            alert('No pages found');
            return;
        }

        const randomPage = pageMap.pages[Math.floor(Math.random() * Math.min(pageMap.pages.length, 50))];
        const pageDetail = await fetchAPI(`/api/table/${currentTable}/page/${randomPage.blockNo}`);

        const liveTuples = pageDetail.tuples.filter(t => t.isLive);
        if (liveTuples.length === 0) {
            alert('No live tuples on selected page, try again');
            return;
        }

        const randomTuple = liveTuples[Math.floor(Math.random() * liveTuples.length)];

        // Get row by TID - this gives us the actual PK value
        const tid = `(${randomPage.blockNo},${randomTuple.lp})`;
        const findResult = await fetchAPI(`/api/table/${currentTable}/find?tid=${encodeURIComponent(tid)}`);

        if (findResult.found && findResult.columnData) {
            // Get the PK value from the found row
            const pkColumn = demoIndexInfo?.pkColumn;
            const pkValue = findResult.columnData[pkColumn];

            if (pkValue != null) {
                // Now load full demo row data by PK
                const fullRow = await fetchAPI(`/api/table/${currentTable}/demo/row?pk=${encodeURIComponent(pkValue)}`);
                if (fullRow.found) {
                    demoRowData = fullRow;
                    document.getElementById('demoPK').value = pkValue;
                    demoResult = null;
                    renderTableTabContent();
                    return;
                }
            }
        }

        // Fallback if column data not available - try a simpler approach
        alert('Could not load random row. Please enter a PK value manually.');
    } catch (err) {
        console.error('Error loading random row:', err);
        alert('Error loading random row: ' + err.message);
    }
}

async function executeDemoUpdate(updateType) {
    if (!demoRowData) {
        alert('Please load a row first');
        return;
    }

    // Get column and value based on update type
    let column, newValue;
    if (updateType === 'hot') {
        column = document.getElementById('demoHotColumn')?.value;
        newValue = document.getElementById('demoHotValue')?.value;
    } else {
        column = document.getElementById('demoRegularColumn')?.value;
        newValue = document.getElementById('demoRegularValue')?.value;
    }

    if (!column) {
        alert('Please select a column');
        return;
    }
    if (!newValue) {
        alert('Please enter a new value');
        return;
    }

    // Get the PK value from the row data
    const pkValue = demoRowData.pkValue || demoRowData.columnData?.[demoIndexInfo?.pkColumn];

    try {
        const result = await fetch(`/api/table/${currentTable}/demo/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pk: String(pkValue),
                column: column,
                newValue: newValue
            })
        });

        const data = await result.json();
        demoResult = data;

        // Update the PK input if PK column was changed
        if (column === demoIndexInfo?.pkColumn && data.success) {
            document.getElementById('demoPK').value = newValue;
        }

        renderTableTabContent();
    } catch (err) {
        alert('Error executing update: ' + err.message);
    }
}

function viewDemoPage(pageNo) {
    highlightTID = null;
    currentTab = 'pages';
    renderTableTabContent();
    setTimeout(() => loadHeapPage(pageNo), 100);
}

function clearDemoResult() {
    demoResult = null;
    renderTableTabContent();
}

function updateDemoValueFromColumn(type) {
    if (!demoRowData?.columnData) return;

    if (type === 'hot') {
        const col = document.getElementById('demoHotColumn')?.value;
        const currentVal = demoRowData.columnData[col] ?? '';
        document.getElementById('demoHotValue').value = currentVal;
        const currentValSpan = document.getElementById('demoHotCurrentVal');
        if (currentValSpan) currentValSpan.textContent = currentVal || 'null';
    } else {
        const col = document.getElementById('demoRegularColumn')?.value;
        const currentVal = demoRowData.columnData[col] ?? '';
        document.getElementById('demoRegularValue').value = currentVal;
        const currentValSpan = document.getElementById('demoRegularCurrentVal');
        if (currentValSpan) currentValSpan.textContent = currentVal || 'null';
    }
}

// ==================== FIND ROW FUNCTIONALITY ====================

async function findRowByPK() {
    const input = document.getElementById('findRowInput').value.trim();
    if (!input) {
        showFindRowResult({ error: 'Please enter a primary key value' });
        return;
    }

    showFindRowResult({ loading: true });

    try {
        const result = await fetchAPI(`/api/table/${currentTable}/find?pk=${encodeURIComponent(input)}`);
        showFindRowResult(result);
    } catch (err) {
        showFindRowResult({ error: err.message });
    }
}

async function findRowByTID() {
    const input = document.getElementById('findRowInput').value.trim();
    if (!input) {
        showFindRowResult({ error: 'Please enter a TID value' });
        return;
    }

    showFindRowResult({ loading: true });

    try {
        const result = await fetchAPI(`/api/table/${currentTable}/find?tid=${encodeURIComponent(input)}`);
        showFindRowResult(result);
    } catch (err) {
        showFindRowResult({ error: err.message });
    }
}

// Auto-detect if input looks like TID or PK
function findRowAuto() {
    const input = document.getElementById('findRowInput').value.trim();
    if (!input) return;

    // If it looks like a TID format (contains parentheses or comma with numbers)
    if (/^\(?\d+,\d+\)?$/.test(input)) {
        findRowByTID();
    } else {
        findRowByPK();
    }
}

function showFindRowResult(result) {
    const container = document.getElementById('findRowResult');
    if (!container) return;

    if (result.loading) {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem;"><span class="loading-spinner" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 8px;"></span>Searching...</div>`;
        return;
    }

    if (result.error) {
        container.innerHTML = `<div style="color: var(--red-400); font-size: 0.9rem;">⚠️ ${result.error}</div>`;
        return;
    }

    if (!result.found) {
        container.innerHTML = `<div style="color: var(--yellow-400); font-size: 0.9rem;">Row not found</div>`;
        return;
    }

    container.innerHTML = `
        <div style="background: var(--bg-primary); border: 2px solid var(--orange-500); border-radius: 12px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-weight: 700; color: var(--orange-400);">✓ Row Found!</div>
                <button class="btn" onclick="goToRowLocation(${result.page}, ${result.item})" style="background: var(--orange-500); border-color: var(--orange-500); color: white;">
                    View in Page ${result.page} →
                </button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                <div style="background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">TID (Location)</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--cyan-400);">${result.tid}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Page</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--text-primary);">${result.page}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Item #</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--text-primary);">${result.item}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Tuple Size</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--text-primary);">${result.tupleSize} bytes</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">xmin (Insert TX)</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: var(--green-400);">${result.xmin}</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 10px 14px; border-radius: 8px;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Status</div>
                    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 1rem; color: ${result.isLive ? 'var(--green-400)' : 'var(--red-400)'};">${result.isLive ? 'LIVE' : 'DEAD'}</div>
                </div>
            </div>
        </div>
    `;
}

function goToRowLocation(page, item) {
    highlightTID = { page, item };
    currentTab = 'pages';

    // Update tabs UI
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === 'Pages');
    });

    // Re-render and load the page
    renderTableTabContent();

    setTimeout(() => {
        loadHeapPage(page);
        setTimeout(() => {
            const tupleEl = document.getElementById(`tuple-${item}`);
            if (tupleEl) {
                tupleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 500);
    }, 100);
}

// ==================== TID CLICK-THROUGH FROM INDEX TO HEAP ====================

// Navigate from index TID to heap page
async function navigateToTID(tableName, page, item) {
    highlightTID = { page, item };
    currentTable = tableName;
    currentView = 'table';
    currentTab = 'pages';

    // Load table data first
    try {
        const [detail, pageMap] = await Promise.all([
            fetchAPI(`/api/table/${tableName}`),
            fetchAPI(`/api/table/${tableName}/pages`)
        ]);

        currentTableData = { detail, pageMap };

        // Render table view
        renderTableView(currentTableData);

        // Wait a tick for DOM to update, then load the specific page
        setTimeout(() => {
            loadHeapPage(page);
            // Scroll to highlighted tuple after page loads
            setTimeout(() => {
                const tupleEl = document.getElementById(`tuple-${item}`);
                if (tupleEl) {
                    tupleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
        }, 100);

        // Update sidebar
        document.querySelectorAll('.table-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(tableName));
        });
        document.querySelectorAll('.index-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    } catch (err) {
        console.error('Failed to navigate to TID:', err);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Event delegation for HTMx-rendered sidebar buttons
    document.getElementById('tableList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-table]');
        if (btn && !btn.hasAttribute('data-index')) {
            selectTable(btn.dataset.table);
        }
    });

    document.getElementById('indexList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-index]');
        if (btn) {
            selectIndex(btn.dataset.index, btn.dataset.table);
        }
    });

    // Track which sidebar sections have loaded
    let tablesLoaded = false;
    let indexesLoaded = false;

    function checkAndLoadFromURL() {
        if (tablesLoaded && indexesLoaded) {
            loadFromURL();
        }
    }

    // Set connection status after HTMx loads sidebar
    document.body.addEventListener('htmx:afterRequest', (e) => {
        const path = e.detail.pathInfo.requestPath;
        if (path.includes('/htmx/tables')) {
            tablesLoaded = true;
            setConnectionStatus(true);
            checkAndLoadFromURL();
        } else if (path.includes('/htmx/indexes')) {
            indexesLoaded = true;
            setConnectionStatus(true);
            checkAndLoadFromURL();
        }
    });

    document.body.addEventListener('htmx:responseError', (e) => {
        if (e.detail.pathInfo.requestPath.includes('/htmx/')) {
            setConnectionStatus(false, 'Connection failed');
        }
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', (e) => {
        if (e.state) {
            if (e.state.type === 'index') {
                const btn = document.querySelector(`[data-index="${e.state.name}"]`);
                selectIndex(e.state.name, btn?.dataset.table, false);
            } else if (e.state.type === 'table') {
                selectTable(e.state.name, false);
            }
        } else {
            // No state = home page, clear selection
            document.getElementById('mainContent').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h2>PostgreSQL Storage Visualizer</h2>
                    <p>Select a table or index from the sidebar to visualize its internal structure</p>
                </div>`;
            document.querySelectorAll('.table-btn, .index-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            currentIndex = null;
            currentTable = null;
            currentView = null;
        }
    });
});

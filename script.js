'use strict';

const STORAGE_KEY = 'cloudVmSchedulerStateV2';
const LEGACY_HOSTS_KEY = 'vmSchedulerHosts';
const LEGACY_VMS_KEY = 'vmSchedulerVMs';

const $ = (id) => document.getElementById(id);

const state = {
  hosts: [],
  vms: [],
  lastResult: null,
  lastAlgorithm: 'first-fit',
  comparisonResults: null
};

const algorithmInfo = {
  'first-fit': {
    name: 'First Fit',
    description: 'Places each VM on the first host in list order with enough free CPU and RAM.',
    complexity: 'O(V × H)',
    advantage: 'Simple, predictable, and fast.',
    limitation: 'Placement order can leave uneven resource usage.'
  },
  'best-fit': {
    name: 'Best Fit',
    description: 'Chooses the feasible host with the smallest sum of normalized leftover CPU and RAM capacity.',
    complexity: 'O(V × H)',
    advantage: 'Packs VMs into hosts while considering both resources on a comparable scale.',
    limitation: 'Can concentrate load on fewer hosts.'
  },
  'load-balanced': {
    name: 'Load Balanced',
    description: 'Chooses the feasible placement that minimizes the standard deviation of host pressure after placement.',
    complexity: 'O(V × H²)',
    advantage: 'Targets more even host pressure across the cluster.',
    limitation: 'Evaluates the cluster after each possible placement, so it does more work.'
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function safePriority(value) {
  return ['High', 'Medium', 'Low'].includes(value) ? value : 'Medium';
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(
    () => toast.classList.remove('show'),
    2600
  );
}

function sampleWorkload() {
  return {
    hosts: [
      { id: 'Host-01', cpu: 16, ram: 32 },
      { id: 'Host-02', cpu: 8, ram: 16 },
      { id: 'Host-03', cpu: 24, ram: 48 },
      { id: 'Host-04', cpu: 16, ram: 32 }
    ],
    vms: [
      { id: 'VM-01', cpu: 4, ram: 8, priority: 'High' },
      { id: 'VM-02', cpu: 2, ram: 4, priority: 'Medium' },
      { id: 'VM-03', cpu: 6, ram: 12, priority: 'High' },
      { id: 'VM-04', cpu: 2, ram: 4, priority: 'Low' },
      { id: 'VM-05', cpu: 8, ram: 16, priority: 'High' },
      { id: 'VM-06', cpu: 4, ram: 8, priority: 'Medium' },
      { id: 'VM-07', cpu: 2, ram: 4, priority: 'Low' },
      { id: 'VM-08', cpu: 6, ram: 10, priority: 'Medium' },
      { id: 'VM-09', cpu: 3, ram: 6, priority: 'Low' },
      { id: 'VM-10', cpu: 4, ram: 8, priority: 'High' }
    ]
  };
}

function isValidId(id) {
  return typeof id === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/.test(id.trim());
}

function validateResources(cpu, ram) {
  return Number.isInteger(cpu) &&
    cpu >= 1 &&
    cpu <= 256 &&
    Number.isInteger(ram) &&
    ram >= 1 &&
    ram <= 1024;
}

function cleanStoredHosts(value) {
  if (!Array.isArray(value)) return null;

  const output = [];
  const ids = new Set();

  for (const item of value) {
    if (!item || typeof item.id !== 'string') continue;

    const id = item.id.trim();
    const cpu = Number(item.cpu);
    const ram = Number(item.ram);
    const key = id.toLowerCase();

    if (
      !isValidId(id) ||
      !validateResources(cpu, ram) ||
      ids.has(key)
    ) continue;

    ids.add(key);
    output.push({ id, cpu, ram });
  }

  return output;
}

function cleanStoredVms(value) {
  if (!Array.isArray(value)) return null;

  const output = [];
  const ids = new Set();

  for (const item of value) {
    if (!item || typeof item.id !== 'string') continue;

    const id = item.id.trim();
    const cpu = Number(item.cpu);
    const ram = Number(item.ram);
    const key = id.toLowerCase();

    if (
      !isValidId(id) ||
      !validateResources(cpu, ram) ||
      ids.has(key)
    ) continue;

    ids.add(key);
    output.push({
      id,
      cpu,
      ram,
      priority: safePriority(item.priority)
    });
  }

  return output;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      hosts: state.hosts,
      vms: state.vms,
      lastAlgorithm: state.lastAlgorithm
    }));

    localStorage.removeItem(LEGACY_HOSTS_KEY);
    localStorage.removeItem(LEGACY_VMS_KEY);
  } catch (error) {
    showToast('Could not save in this browser. Check storage/privacy settings.');
  }
}

function loadState() {
  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    saved = null;
  }

  if (saved && Array.isArray(saved.hosts) && Array.isArray(saved.vms)) {
    state.hosts = cleanStoredHosts(saved.hosts) ?? [];
    state.vms = cleanStoredVms(saved.vms) ?? [];
    state.lastAlgorithm = algorithmInfo[saved.lastAlgorithm]
      ? saved.lastAlgorithm
      : 'first-fit';

    // Empty arrays are intentional and must survive refresh.
    return;
  }

  // Migrate saved data from the previous two-key format.
  try {
    const oldHosts = JSON.parse(
      localStorage.getItem(LEGACY_HOSTS_KEY) || 'null'
    );

    const oldVms = JSON.parse(
      localStorage.getItem(LEGACY_VMS_KEY) || 'null'
    );

    if (Array.isArray(oldHosts) && Array.isArray(oldVms)) {
      state.hosts = cleanStoredHosts(oldHosts) ?? [];
      state.vms = cleanStoredVms(oldVms) ?? [];
      saveState();
      return;
    }
  } catch (error) {
    // Corrupt old data is ignored.
  }

  // First visit only: initialize with example data.
  const example = sampleWorkload();
  state.hosts = example.hosts;
  state.vms = example.vms;
  saveState();
}

function invalidateResults() {
  state.lastResult = null;
  state.comparisonResults = null;
  $('lastRunText').textContent = 'Not scheduled yet';
}

function generateSampleData(showMessage = true) {
  const example = sampleWorkload();

  state.hosts = example.hosts;
  state.vms = example.vms;

  invalidateResults();
  saveState();
  renderAll();

  if (showMessage) showToast('Example cloud workload loaded.');
}

function resetAll() {
  state.hosts = [];
  state.vms = [];

  invalidateResults();
  saveState();
  renderAll();

  showToast('Simulator reset. Empty state saved.');
}

function renderAlgorithmInfo() {
  const info = algorithmInfo[$('algorithmSelect').value] ||
    algorithmInfo['first-fit'];

  $('selectedAlgorithmChip').textContent = info.name;

  $('algorithmInfo').innerHTML = `
    <div class="info-box">
      <strong>${escapeHtml(info.name)}</strong>
      <p>${escapeHtml(info.description)}</p>
    </div>
    <div class="info-box">
      <strong>Complexity</strong>
      <p>${escapeHtml(info.complexity)}</p>
    </div>
    <div class="info-box">
      <strong>Advantage</strong>
      <p>${escapeHtml(info.advantage)}</p>
    </div>
    <div class="info-box">
      <strong>Limitation</strong>
      <p>${escapeHtml(info.limitation)}</p>
    </div>`;
}

function renderStats() {
  const metrics = state.lastResult?.metrics;

  $('statHosts').textContent = state.hosts.length;
  $('statVMs').textContent = state.vms.length;
  $('statScheduled').textContent = metrics ? metrics.scheduled : 0;
  $('statFailed').textContent = metrics ? metrics.failed : 0;
  $('statCpu').textContent = metrics ? `${metrics.avgCpu.toFixed(1)}%` : '0%';
  $('statRam').textContent = metrics ? `${metrics.avgRam.toFixed(1)}%` : '0%';

  $('statOverallCpu').textContent = metrics
    ? `${metrics.overallCpu.toFixed(1)}%`
    : '0%';

  $('statOverallRam').textContent = metrics
    ? `${metrics.overallRam.toFixed(1)}%`
    : '0%';

  $('hostCount').textContent = state.hosts.length;
  $('vmCount').textContent = state.vms.length;
}

function renderHosts() {
  const root = $('hostsList');

  if (!state.hosts.length) {
    root.innerHTML =
      '<div class="empty-state">No hosts yet. Click <strong>+ Add Host</strong>.</div>';
    return;
  }

  const resultByHost = new Map(
    (state.lastResult?.hosts || []).map((host) => [host.id, host])
  );

  root.innerHTML = state.hosts.map((host) => {
    const current = resultByHost.get(host.id);
    const count = current ? current.vms.length : 0;

    return `
      <div class="entity-row">
        <div class="entity-main">
          <div class="entity-title">${escapeHtml(host.id)}</div>
          <div class="entity-meta">
            ${host.cpu} CPU cores • ${host.ram} GB RAM
            ${current ? ` • ${count} VM${count === 1 ? '' : 's'} assigned` : ''}
          </div>
        </div>
        <button
          class="icon-btn"
          type="button"
          title="Delete host ${escapeHtml(host.id)}"
          aria-label="Delete host ${escapeHtml(host.id)}"
          data-action="delete-host"
          data-id="${escapeHtml(host.id)}"
        >×</button>
      </div>`;
  }).join('');
}

function renderVMs() {
  const root = $('vmsList');

  if (!state.vms.length) {
    root.innerHTML =
      '<div class="empty-state">No VMs yet. Click <strong>+ Add VM</strong>.</div>';
    return;
  }

  root.innerHTML = state.vms.map((vm) => {
    const priority = safePriority(vm.priority);

    return `
      <div class="entity-row">
        <div class="entity-main">
          <div class="entity-title">
            ${escapeHtml(vm.id)}
            <span class="tag ${priority.toLowerCase()}">${priority}</span>
          </div>
          <div class="entity-meta">
            ${vm.cpu} CPU cores • ${vm.ram} GB RAM
          </div>
        </div>
        <button
          class="icon-btn"
          type="button"
          title="Delete VM ${escapeHtml(vm.id)}"
          aria-label="Delete VM ${escapeHtml(vm.id)}"
          data-action="delete-vm"
          data-id="${escapeHtml(vm.id)}"
        >×</button>
      </div>`;
  }).join('');
}

function renderCloudView() {
  const root = $('cloudView');

  if (!state.hosts.length) {
    root.innerHTML =
      '<div class="empty-state">Add at least one host to view the cloud.</div>';
    return;
  }

  const resultHosts = state.lastResult?.hosts ||
    SchedulerCore.createWorkingHosts(state.hosts);

  const failedVMs = state.lastResult?.failedVMs || [];

  root.innerHTML = resultHosts.map((host) => {
    const cpuPct = Math.min(100, (host.usedCpu / host.cpu) * 100);
    const ramPct = Math.min(100, (host.usedRam / host.ram) * 100);

    return `
      <div class="host-card">
        <div class="host-head">
          <div class="host-id">${escapeHtml(host.id)}</div>
          <div class="host-count">${host.vms.length} VM${host.vms.length === 1 ? '' : 's'}</div>
        </div>

        <div class="capacity-row">
          <div class="capacity-head">
            <span>CPU</span>
            <span>${host.usedCpu} / ${host.cpu} cores (${cpuPct.toFixed(0)}%)</span>
          </div>
          <div class="progress">
            <span style="width:${cpuPct}%"></span>
          </div>
        </div>

        <div class="capacity-row">
          <div class="capacity-head">
            <span>RAM</span>
            <span>${host.usedRam} / ${host.ram} GB (${ramPct.toFixed(0)}%)</span>
          </div>
          <div class="progress">
            <span style="width:${ramPct}%"></span>
          </div>
        </div>

        <div class="vm-stack">
          ${host.vms.length
            ? host.vms.map((id) =>
                `<div class="vm-pill">${escapeHtml(id)}</div>`
              ).join('')
            : '<span class="subtle">No VMs placed</span>'}
        </div>
      </div>`;
  }).join('');

  if (failedVMs.length) {
    root.innerHTML += `
      <div class="failed-zone">
        <strong>Unscheduled:</strong>
        ${failedVMs.map(escapeHtml).join(', ')}
      </div>`;
  }
}

function renderResults() {
  const root = $('resultsBody');

  if (!state.vms.length) {
    root.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">No VM data.</div></td></tr>';

    $('resultSummary').textContent = '0 VMs processed';
    return;
  }

  if (!state.lastResult) {
    root.innerHTML =
      '<tr><td colspan="6"><div class="empty-state">Run the scheduler to generate allocation results.</div></td></tr>';

    $('resultSummary').textContent = '0 VMs processed';
    return;
  }

  const map = new Map(
    state.lastResult.allocations.map((allocation) => [allocation.vmId, allocation])
  );

  root.innerHTML = state.vms.map((vm) => {
    const result = map.get(vm.id);
    const success = result?.status === 'Scheduled';
    const priority = safePriority(vm.priority);

    return `
      <tr>
        <td><strong>${escapeHtml(vm.id)}</strong></td>
        <td>${vm.cpu}</td>
        <td>${vm.ram} GB</td>
        <td><span class="tag ${priority.toLowerCase()}">${priority}</span></td>
        <td>${escapeHtml(result?.hostId || '—')}</td>
        <td>
          <span class="status ${success ? 'success' : 'fail'}">
            ${success ? 'Scheduled' : 'Failed'}
          </span>
        </td>
      </tr>`;
  }).join('');

  $('resultSummary').textContent =
    `${state.lastResult.metrics.scheduled} scheduled • ${state.lastResult.metrics.failed} failed`;
}

function renderComparison(results = state.comparisonResults) {
  if (!results || !results.length) {
    $('comparisonEmpty').classList.remove('hidden');
    $('comparisonContent').classList.add('hidden');
    return;
  }

  $('comparisonEmpty').classList.add('hidden');
  $('comparisonContent').classList.remove('hidden');

  $('comparisonBody').innerHTML = results.map((result) => {
    const m = result.metrics;

    return `
      <tr>
        <td><strong>${escapeHtml(algorithmInfo[result.algorithm].name)}</strong></td>
        <td>${m.scheduled}</td>
        <td>${m.failed}</td>
        <td>${m.avgCpu.toFixed(1)}%</td>
        <td>${m.avgRam.toFixed(1)}%</td>
        <td>${m.overallCpu.toFixed(1)}%</td>
        <td>${m.overallRam.toFixed(1)}%</td>
        <td>${m.loadImbalance.toFixed(1)}%</td>
      </tr>`;
  }).join('');

  const maxScheduled = Math.max(
    ...results.map((result) => result.metrics.scheduled),
    1
  );

  $('comparisonChart').innerHTML = results.map((result) => {
    const pct = (result.metrics.scheduled / maxScheduled) * 100;

    return `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(algorithmInfo[result.algorithm].name)}</div>
        <div class="bar-track"><span style="width:${pct}%"></span></div>
        <div class="bar-value">${result.metrics.scheduled}/${state.vms.length}</div>
      </div>`;
  }).join('');
}

function renderAll() {
  renderAlgorithmInfo();
  renderStats();
  renderHosts();
  renderVMs();
  renderCloudView();
  renderResults();
  renderComparison();
}

function runScheduler() {
  if (!state.hosts.length) {
    return showToast('Add at least one host before running the scheduler.');
  }

  if (!state.vms.length) {
    return showToast('Add at least one VM before running the scheduler.');
  }

  try {
    const algorithm = $('algorithmSelect').value;
    state.lastAlgorithm = algorithm;

    state.lastResult = SchedulerCore.schedule(
      algorithm,
      state.hosts,
      state.vms
    );

    saveState();
    renderAll();

    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    $('lastRunText').textContent =
      `Last run: ${algorithmInfo[algorithm].name} • ${time}`;

    document.querySelectorAll('.host-card').forEach((card, index) => {
      setTimeout(() => card.classList.add('flash'), index * 35);
      setTimeout(() => card.classList.remove('flash'), 650 + index * 35);
    });

    showToast(
      `${algorithmInfo[algorithm].name} completed: ` +
      `${state.lastResult.metrics.scheduled} scheduled, ` +
      `${state.lastResult.metrics.failed} failed.`
    );
  } catch (error) {
    console.error(error);
    showToast(`Scheduler error: ${error.message}`);
  }
}

function compareAlgorithms() {
  if (!state.hosts.length || !state.vms.length) {
    return showToast('Add at least one host and one VM before comparing.');
  }

  try {
    state.comparisonResults = SchedulerCore.ALGORITHMS.map((algorithm) =>
      SchedulerCore.schedule(algorithm, state.hosts, state.vms)
    );

    renderComparison();
    showToast('All three algorithms compared on the same workload.');
  } catch (error) {
    console.error(error);
    showToast(`Comparison error: ${error.message}`);
  }
}

function deleteHost(id) {
  state.hosts = state.hosts.filter((host) => host.id !== id);

  invalidateResults();
  saveState();
  renderAll();

  showToast(`Host ${id} deleted. Results and comparison cleared.`);
}

function deleteVM(id) {
  state.vms = state.vms.filter((vm) => vm.id !== id);

  invalidateResults();
  saveState();
  renderAll();

  showToast(`VM ${id} deleted. Results and comparison cleared.`);
}

function openModal(type) {
  const isHost = type === 'host';

  $('modalContent').innerHTML = isHost ? `
    <h3 id="modalTitle">Add Cloud Host</h3>
    <p>Define the CPU and RAM capacity of a host.</p>

    <form class="modal-form" id="hostForm" novalidate>
      <label>
        Host ID
        <input class="input" id="hostIdInput" maxlength="40"
          placeholder="Host-05" required autocomplete="off" />
      </label>

      <label>
        CPU Cores
        <input class="input" id="hostCpuInput" type="number"
          min="1" max="256" step="1" placeholder="16" required />
      </label>

      <label>
        RAM (GB)
        <input class="input" id="hostRamInput" type="number"
          min="1" max="1024" step="1" placeholder="32" required />
      </label>

      <div class="modal-actions">
        <button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">Add Host</button>
      </div>
    </form>` : `
    <h3 id="modalTitle">Add Virtual Machine</h3>
    <p>Define the CPU and RAM resources required by the VM.</p>

    <form class="modal-form" id="vmForm" novalidate>
      <label>
        VM ID
        <input class="input" id="vmIdInput" maxlength="40"
          placeholder="VM-11" required autocomplete="off" />
      </label>

      <label>
        CPU Cores
        <input class="input" id="vmCpuInput" type="number"
          min="1" max="256" step="1" placeholder="4" required />
      </label>

      <label>
        RAM (GB)
        <input class="input" id="vmRamInput" type="number"
          min="1" max="1024" step="1" placeholder="8" required />
      </label>

      <label>
        Priority (display only)
        <select class="input" id="vmPriorityInput">
          <option>High</option>
          <option selected>Medium</option>
          <option>Low</option>
        </select>
      </label>

      <div class="modal-actions">
        <button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">Add VM</button>
      </div>
    </form>`;

  $('modalBackdrop').classList.remove('hidden');

  const form = $(isHost ? 'hostForm' : 'vmForm');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const id = $(isHost ? 'hostIdInput' : 'vmIdInput').value.trim();
    const cpu = Number($(isHost ? 'hostCpuInput' : 'vmCpuInput').value);
    const ram = Number($(isHost ? 'hostRamInput' : 'vmRamInput').value);

    if (!isValidId(id)) {
      return showToast(
        'ID must start with a letter/number and use only letters, numbers, spaces, dots, underscores or hyphens (max 40 characters).'
      );
    }

    if (!validateResources(cpu, ram)) {
      return showToast(
        'CPU must be an integer from 1–256 and RAM an integer from 1–1024 GB.'
      );
    }

    const collection = isHost ? state.hosts : state.vms;

    if (collection.some((item) => item.id.toLowerCase() === id.toLowerCase())) {
      return showToast(`That ${isHost ? 'Host' : 'VM'} ID already exists.`);
    }

    collection.push(
      isHost
        ? { id, cpu, ram }
        : { id, cpu, ram, priority: safePriority($('vmPriorityInput').value) }
    );

    invalidateResults();
    saveState();
    renderAll();
    closeModal();

    showToast(`${id} added. Run the scheduler to refresh placements.`);
  });

  const firstInput = form.querySelector('input');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  $('modalBackdrop').classList.add('hidden');
}

// Event delegation: user-supplied IDs are not injected into JavaScript handlers.
$('hostsList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="delete-host"]');
  if (button) deleteHost(button.dataset.id);
});

$('vmsList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="delete-vm"]');
  if (button) deleteVM(button.dataset.id);
});

$('modalContent').addEventListener('click', (event) => {
  if (event.target.closest('[data-action="close-modal"]')) closeModal();
});

$('algorithmSelect').addEventListener('change', renderAlgorithmInfo);
$('runBtn').addEventListener('click', runScheduler);
$('sampleBtn').addEventListener('click', () => generateSampleData(true));
$('compareBtn').addEventListener('click', compareAlgorithms);
$('resetBtn').addEventListener('click', resetAll);
$('addHostBtn').addEventListener('click', () => openModal('host'));
$('addVmBtn').addEventListener('click', () => openModal('vm'));
$('modalClose').addEventListener('click', closeModal);

$('modalBackdrop').addEventListener('click', (event) => {
  if (event.target === $('modalBackdrop')) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

loadState();
$('algorithmSelect').value = state.lastAlgorithm;
renderAll();

// Public methods are useful for browser smoke tests and debugging.
window.CloudVMScheduler = {
  getState: () => ({
    hosts: state.hosts.map((item) => ({ ...item })),
    vms: state.vms.map((item) => ({ ...item })),
    lastAlgorithm: state.lastAlgorithm,
    hasResult: Boolean(state.lastResult),
    hasComparison: Boolean(state.comparisonResults)
  }),
  runScheduler,
  compareAlgorithms,
  resetAll,
  generateSampleData,
  deleteHost,
  deleteVM,
  addHost: (host) => {
    state.hosts.push({ ...host });
    invalidateResults();
    saveState();
    renderAll();
  },
  addVM: (vm) => {
    state.vms.push({ ...vm, priority: safePriority(vm.priority) });
    invalidateResults();
    saveState();
    renderAll();
  }
};

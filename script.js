const state = {
  hosts: [],
  vms: [],
  lastResult: null,
  lastAlgorithm: "first-fit"
};


const algorithmInfo = {

  "first-fit": {
    name: "First Fit",
    description:
      "Places each VM on the first host, in order, that has enough free CPU and RAM.",
    complexity: "O(V × H)",
    advantage: "Simple and fast",
    limitation: "Can leave uneven resource usage"
  },

  "best-fit": {
    name: "Best Fit",
    description:
      "Places each VM on the feasible host that leaves the smallest combined amount of free CPU and RAM.",
    complexity: "O(V × H)",
    advantage: "Reduces leftover fragments",
    limitation: "Can concentrate load on fewer hosts"
  },

  "load-balanced": {
    name: "Load Balanced",
    description:
      "Chooses the feasible host that produces the most balanced CPU and RAM utilization after placement.",
    complexity: "O(V × H)",
    advantage: "Spreads workload more evenly",
    limitation: "Slightly more calculation per VM"
  }

};


const $ = (id) => document.getElementById(id);


function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}


function showToast(message) {

  const toast = $("toast");

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);

}


function saveState() {

  localStorage.setItem(
    "vmSchedulerHosts",
    JSON.stringify(state.hosts)
  );

  localStorage.setItem(
    "vmSchedulerVMs",
    JSON.stringify(state.vms)
  );

}


function loadState() {

  try {

    const hosts = JSON.parse(
      localStorage.getItem("vmSchedulerHosts") || "null"
    );

    const vms = JSON.parse(
      localStorage.getItem("vmSchedulerVMs") || "null"
    );


    if (
      Array.isArray(hosts) &&
      Array.isArray(vms) &&
      hosts.length &&
      vms.length
    ) {

      state.hosts = hosts;
      state.vms = vms;

      return;
    }

  } catch (error) {

  }


  generateSampleData(false);
}


function generateSampleData(showMessage = true) {

  state.hosts = [

    {
      id: "Host-01",
      cpu: 16,
      ram: 32
    },

    {
      id: "Host-02",
      cpu: 8,
      ram: 16
    },

    {
      id: "Host-03",
      cpu: 24,
      ram: 48
    },

    {
      id: "Host-04",
      cpu: 16,
      ram: 32
    }

  ];


  state.vms = [

    {
      id: "VM-01",
      cpu: 4,
      ram: 8,
      priority: "High"
    },

    {
      id: "VM-02",
      cpu: 2,
      ram: 4,
      priority: "Medium"
    },

    {
      id: "VM-03",
      cpu: 6,
      ram: 12,
      priority: "High"
    },

    {
      id: "VM-04",
      cpu: 2,
      ram: 4,
      priority: "Low"
    },

    {
      id: "VM-05",
      cpu: 8,
      ram: 16,
      priority: "High"
    },

    {
      id: "VM-06",
      cpu: 4,
      ram: 8,
      priority: "Medium"
    },

    {
      id: "VM-07",
      cpu: 2,
      ram: 4,
      priority: "Low"
    },

    {
      id: "VM-08",
      cpu: 6,
      ram: 10,
      priority: "Medium"
    },

    {
      id: "VM-09",
      cpu: 3,
      ram: 6,
      priority: "Low"
    },

    {
      id: "VM-10",
      cpu: 4,
      ram: 8,
      priority: "High"
    }

  ];


  state.lastResult = null;

  saveState();

  renderAll();

  if (showMessage) {

    showToast(
      "Example cloud workload loaded."
    );

  }

}


function resetAll() {

  state.hosts = [];

  state.vms = [];

  state.lastResult = null;

  localStorage.removeItem(
    "vmSchedulerHosts"
  );

  localStorage.removeItem(
    "vmSchedulerVMs"
  );

  renderAll();

  showToast(
    "Simulator reset."
  );

}


function canPlace(host, vm) {

  return (
    host.remainingCpu >= vm.cpu &&
    host.remainingRam >= vm.ram
  );

}


function createWorkingHosts(hosts) {

  return hosts.map((host) => ({

    ...cloneData(host),

    usedCpu: 0,

    usedRam: 0,

    remainingCpu: Number(host.cpu),

    remainingRam: Number(host.ram),

    vms: []

  }));

}


function placeVm(host, vm) {

  host.usedCpu += vm.cpu;

  host.usedRam += vm.ram;

  host.remainingCpu -= vm.cpu;

  host.remainingRam -= vm.ram;

  host.vms.push(vm.id);

}


/* =========================
   FIRST FIT
========================= */

function firstFit(hosts, vms) {

  const working =
    createWorkingHosts(hosts);

  const allocations = [];

  const failedVMs = [];


  for (const vm of vms) {

    let placed = false;


    for (const host of working) {

      if (canPlace(host, vm)) {

        placeVm(host, vm);

        allocations.push({

          vmId: vm.id,

          hostId: host.id,

          status: "Scheduled"

        });

        placed = true;

        break;
      }

    }


    if (!placed) {

      allocations.push({

        vmId: vm.id,

        hostId: null,

        status: "Failed"

      });

      failedVMs.push(vm.id);

    }

  }


  return buildResult(
    "first-fit",
    working,
    allocations,
    failedVMs
  );

}


/* =========================
   BEST FIT
========================= */

function bestFit(hosts, vms) {

  const working =
    createWorkingHosts(hosts);

  const allocations = [];

  const failedVMs = [];


  for (const vm of vms) {

    const candidates =
      working.filter(
        (host) =>
          canPlace(host, vm)
      );


    if (!candidates.length) {

      allocations.push({

        vmId: vm.id,

        hostId: null,

        status: "Failed"

      });

      failedVMs.push(vm.id);

      continue;
    }


    candidates.sort(
      (a, b) => {

        const aScore =
          (a.remainingCpu - vm.cpu) +
          (a.remainingRam - vm.ram);


        const bScore =
          (b.remainingCpu - vm.cpu) +
          (b.remainingRam - vm.ram);


        return aScore - bScore;
      }
    );


    const chosen =
      candidates[0];


    placeVm(chosen, vm);


    allocations.push({

      vmId: vm.id,

      hostId: chosen.id,

      status: "Scheduled"

    });

  }


  return buildResult(
    "best-fit",
    working,
    allocations,
    failedVMs
  );

}


/* =========================
   LOAD BALANCED
========================= */

function loadBalanced(hosts, vms) {

  const working =
    createWorkingHosts(hosts);

  const allocations = [];

  const failedVMs = [];


  for (const vm of vms) {

    const candidates =
      working.filter(
        (host) =>
          canPlace(host, vm)
      );


    if (!candidates.length) {

      allocations.push({

        vmId: vm.id,

        hostId: null,

        status: "Failed"

      });

      failedVMs.push(vm.id);

      continue;
    }


    candidates.sort(
      (a, b) =>
        scoreLoadBalanced(b, vm) -
        scoreLoadBalanced(a, vm)
    );


    const chosen =
      candidates[0];


    placeVm(chosen, vm);


    allocations.push({

      vmId: vm.id,

      hostId: chosen.id,

      status: "Scheduled"

    });

  }


  return buildResult(
    "load-balanced",
    working,
    allocations,
    failedVMs
  );

}


function scoreLoadBalanced(host, vm) {

  const cpuPct =
    (
      (host.usedCpu + vm.cpu) /
      host.cpu
    ) * 100;


  const ramPct =
    (
      (host.usedRam + vm.ram) /
      host.ram
    ) * 100;


  const average =
    (cpuPct + ramPct) / 2;


  const difference =
    Math.abs(
      cpuPct - ramPct
    );


  return -(
    average +
    difference
  );

}


/* =========================
   SCHEDULER
========================= */

function schedule(
  algorithm,
  hosts,
  vms
) {

  if (
    !hosts.length ||
    !vms.length
  ) {

    return buildResult(
      algorithm,
      createWorkingHosts(hosts),
      [],
      vms.map(
        (v) => v.id
      )
    );

  }


  if (
    algorithm === "best-fit"
  ) {

    return bestFit(
      hosts,
      vms
    );

  }


  if (
    algorithm ===
    "load-balanced"
  ) {

    return loadBalanced(
      hosts,
      vms
    );

  }


  return firstFit(
    hosts,
    vms
  );

}


/* =========================
   METRICS
========================= */

function buildResult(
  algorithm,
  workingHosts,
  allocations,
  failedVMs
) {

  const cpuUtils =
    workingHosts.map(
      (host) =>
        host.cpu
          ? (host.usedCpu / host.cpu) * 100
          : 0
    );


  const ramUtils =
    workingHosts.map(
      (host) =>
        host.ram
          ? (host.usedRam / host.ram) * 100
          : 0
    );


  const avgCpu =
    cpuUtils.length
      ? cpuUtils.reduce(
          (a, b) => a + b,
          0
        ) / cpuUtils.length
      : 0;


  const avgRam =
    ramUtils.length
      ? ramUtils.reduce(
          (a, b) => a + b,
          0
        ) / ramUtils.length
      : 0;


  const loads =
    workingHosts.map(
      (host) =>
        Math.max(

          host.cpu
            ? (
                host.usedCpu /
                host.cpu
              ) * 100
            : 0,

          host.ram
            ? (
                host.usedRam /
                host.ram
              ) * 100
            : 0

        )
    );


  const loadImbalance =
    loads.length
      ? Math.max(...loads) -
        Math.min(...loads)
      : 0;


  return {

    algorithm,

    allocations,

    failedVMs,

    hosts: workingHosts,

    metrics: {

      scheduled:
        allocations.filter(
          (a) =>
            a.status ===
            "Scheduled"
        ).length,

      failed:
        failedVMs.length,

      avgCpu,

      avgRam,

      activeHosts:
        workingHosts.filter(
          (host) =>
            host.vms.length
        ).length,

      unusedHosts:
        workingHosts.filter(
          (host) =>
            !host.vms.length
        ).length,

      loadImbalance

    }

  };

}


/* =========================
   UI
========================= */

function renderAlgorithmInfo() {

  const info =
    algorithmInfo[
      $("algorithmSelect").value
    ];


  $("selectedAlgorithmChip")
    .textContent =
    info.name;


  $("algorithmInfo").innerHTML = `

    <div class="info-box">
      <strong>${info.name}</strong>
      <p>${info.description}</p>
    </div>

    <div class="info-box">
      <strong>Complexity</strong>
      <p>${info.complexity}</p>
    </div>

    <div class="info-box">
      <strong>Advantage</strong>
      <p>${info.advantage}</p>
    </div>

    <div class="info-box">
      <strong>Limitation</strong>
      <p>${info.limitation}</p>
    </div>

  `;

}


function renderStats() {

  const metrics =
    state.lastResult?.metrics;


  $("statHosts")
    .textContent =
    state.hosts.length;


  $("statVMs")
    .textContent =
    state.vms.length;


  $("statScheduled")
    .textContent =
    metrics
      ? metrics.scheduled
      : 0;


  $("statFailed")
    .textContent =
    metrics
      ? metrics.failed
      : 0;


  $("statCpu")
    .textContent =
    metrics
      ? `${metrics.avgCpu.toFixed(0)}%`
      : "0%";


  $("statRam")
    .textContent =
    metrics
      ? `${metrics.avgRam.toFixed(0)}%`
      : "0%";


  $("hostCount")
    .textContent =
    state.hosts.length;


  $("vmCount")
    .textContent =
    state.vms.length;

}


function renderHosts() {

  const root =
    $("hostsList");


  if (!state.hosts.length) {

    root.innerHTML = `

      <div class="empty-state">

        No hosts yet.

        Click
        <strong>
          + Add Host
        </strong>.

      </div>

    `;

    return;
  }


  const resultByHost = {};


  (
    state.lastResult?.hosts ||
    []
  ).forEach(
    (host) =>
      resultByHost[
        host.id
      ] = host
  );


  root.innerHTML =
    state.hosts.map(
      (host) => {

        const current =
          resultByHost[
            host.id
          ];


        const count =
          current
            ? current.vms.length
            : 0;


        return `

          <div class="entity-row">

            <div class="entity-main">

              <div class="entity-title">
                ${escapeHtml(host.id)}
              </div>

              <div class="entity-meta">

                ${host.cpu}
                CPU cores

                •

                ${host.ram}
                GB RAM

                ${
                  current
                    ? `
                      •
                      ${count}
                      VM
                      ${count === 1
                        ? ""
                        : "s"}
                      assigned
                    `
                    : ""
                }

              </div>

            </div>


            <button
              class="icon-btn"
              title="Delete host"
              onclick="
                deleteHost(
                  '${encodeURIComponent(
                    host.id
                  )}'
                )
              "
            >
              ×
            </button>

          </div>

        `;

      }
    ).join("");

}


function renderVMs() {

  const root =
    $("vmsList");


  if (!state.vms.length) {

    root.innerHTML = `

      <div class="empty-state">

        No VMs yet.

        Click
        <strong>
          + Add VM
        </strong>.

      </div>

    `;

    return;
  }


  root.innerHTML =
    state.vms.map(
      (vm) => `

        <div class="entity-row">

          <div class="entity-main">

            <div class="entity-title">

              ${escapeHtml(vm.id)}

              <span
                class="tag
                ${vm.priority.toLowerCase()}"
              >
                ${escapeHtml(
                  vm.priority
                )}
              </span>

            </div>

            <div class="entity-meta">

              ${vm.cpu}
              CPU cores

              •

              ${vm.ram}
              GB RAM

            </div>

          </div>


          <button
            class="icon-btn"
            title="Delete VM"
            onclick="
              deleteVM(
                '${encodeURIComponent(
                  vm.id
                )}'
              )
            "
          >
            ×
          </button>

        </div>

      `
    ).join("");

}


function renderCloudView() {

  const root =
    $("cloudView");


  if (!state.hosts.length) {

    root.innerHTML = `

      <div class="empty-state">

        Add at least one host
        to view the cloud.

      </div>

    `;

    return;
  }


  const resultHosts =
    state.lastResult?.hosts ||
    createWorkingHosts(
      state.hosts
    );


  const failedVMs =
    state.lastResult?.failedVMs ||
    [];


  root.innerHTML =
    resultHosts.map(
      (host) => {

        const cpuPct =
          host.cpu
            ? Math.min(
                100,
                (
                  host.usedCpu /
                  host.cpu
                ) * 100
              )
            : 0;


        const ramPct =
          host.ram
            ? Math.min(
                100,
                (
                  host.usedRam /
                  host.ram
                ) * 100
              )
            : 0;


        return `

          <div class="host-card">

            <div class="host-head">

              <div class="host-id">
                ${escapeHtml(
                  host.id
                )}
              </div>

              <div class="host-count">

                ${host.vms.length}
                VM
                ${
                  host.vms.length === 1
                    ? ""
                    : "s"
                }

              </div>

            </div>


            <div class="capacity-row">

              <div class="capacity-head">

                <span>
                  CPU
                </span>

                <span>

                  ${host.usedCpu}
                  /
                  ${host.cpu}
                  cores

                  (
                  ${cpuPct.toFixed(0)}%
                  )

                </span>

              </div>


              <div class="progress">

                <span
                  style="
                    width:${cpuPct}%
                  "
                ></span>

              </div>

            </div>


            <div class="capacity-row">

              <div class="capacity-head">

                <span>
                  RAM
                </span>

                <span>

                  ${host.usedRam}
                  /
                  ${host.ram}
                  GB

                  (
                  ${ramPct.toFixed(0)}%
                  )

                </span>

              </div>


              <div class="progress">

                <span
                  style="
                    width:${ramPct}%
                  "
                ></span>

              </div>

            </div>


            <div class="vm-stack">

              ${
                host.vms.length

                  ? host.vms
                      .map(
                        (vmId) =>
                          `
                            <div class="vm-pill">

                              ${escapeHtml(
                                vmId
                              )}

                            </div>
                          `
                      )
                      .join("")

                  : `
                      <span class="subtle">
                        No VMs placed
                      </span>
                    `
              }

            </div>

          </div>

        `;

      }
    ).join("");


  if (failedVMs.length) {

    root.innerHTML += `

      <div class="failed-zone">

        <strong>
          Unscheduled:
        </strong>

        ${failedVMs
          .map(escapeHtml)
          .join(", ")}

      </div>

    `;

  }

}


function renderResults() {

  const root =
    $("resultsBody");


  if (!state.vms.length) {

    root.innerHTML = `

      <tr>

        <td colspan="6">

          <div class="empty-state">
            No VM data.
          </div>

        </td>

      </tr>

    `;


    $("resultSummary")
      .textContent =
      "0 VMs processed";


    return;
  }


  if (!state.lastResult) {

    root.innerHTML = `

      <tr>

        <td colspan="6">

          <div class="empty-state">

            Run the scheduler
            to generate allocation results.

          </div>

        </td>

      </tr>

    `;


    $("resultSummary")
      .textContent =
      "0 VMs processed";


    return;
  }


  const map = {};


  state.lastResult.allocations
    .forEach(
      (allocation) => {

        map[
          allocation.vmId
        ] = allocation;

      }
    );


  root.innerHTML =
    state.vms.map(
      (vm) => {

        const result =
          map[vm.id];


        const success =
          result?.status ===
          "Scheduled";


        return `

          <tr>

            <td>
              <strong>
                ${escapeHtml(vm.id)}
              </strong>
            </td>

            <td>
              ${vm.cpu}
            </td>

            <td>
              ${vm.ram}
              GB
            </td>

            <td>

              <span
                class="
                  tag
                  ${vm.priority.toLowerCase()}
                "
              >

                ${escapeHtml(
                  vm.priority
                )}

              </span>

            </td>

            <td>

              ${
                result?.hostId ||
                "—"
              }

            </td>

            <td>

              <span
                class="
                  status
                  ${
                    success
                      ? "success"
                      : "fail"
                  }
                "
              >

                ${
                  success
                    ? "Scheduled"
                    : "Failed"
                }

              </span>

            </td>

          </tr>

        `;

      }
    ).join("");


  $("resultSummary")
    .textContent =
    `
      ${state.lastResult.metrics.scheduled}
      scheduled •

      ${state.lastResult.metrics.failed}
      failed
    `;

}


function renderComparison(
  results = null
) {

  if (!results) {

    $("comparisonEmpty")
      .classList
      .remove("hidden");

    $("comparisonContent")
      .classList
      .add("hidden");

    return;
  }


  $("comparisonEmpty")
    .classList
    .add("hidden");


  $("comparisonContent")
    .classList
    .remove("hidden");


  $("comparisonBody")
    .innerHTML =
    results.map(
      (result) => `

        <tr>

          <td>
            <strong>
              ${
                algorithmInfo[
                  result.algorithm
                ].name
              }
            </strong>
          </td>

          <td>
            ${result.metrics.scheduled}
          </td>

          <td>
            ${result.metrics.failed}
          </td>

          <td>
            ${result.metrics.avgCpu.toFixed(0)}%
          </td>

          <td>
            ${result.metrics.avgRam.toFixed(0)}%
          </td>

          <td>
            ${result.metrics.loadImbalance.toFixed(0)}%
          </td>

        </tr>

      `
    ).join("");


  const max =
    Math.max(
      ...results.map(
        (result) =>
          result.metrics.scheduled
      ),
      1
    );


  $("comparisonChart")
    .innerHTML =
    results.map(
      (result) => {

        const pct =
          (
            result.metrics.scheduled /
            max
          ) * 100;


        return `

          <div class="bar-row">

            <div class="bar-label">

              ${
                algorithmInfo[
                  result.algorithm
                ].name
              }

            </div>

            <div class="bar-track">

              <span
                style="
                  width:${pct}%
                "
              ></span>

            </div>

            <div class="bar-value">

              ${result.metrics.scheduled}
              /
              ${state.vms.length}

            </div>

          </div>

        `;

      }
    ).join("");

}


function renderAll() {

  renderAlgorithmInfo();

  renderStats();

  renderHosts();

  renderVMs();

  renderCloudView();

  renderResults();

}


function runScheduler() {

  if (!state.hosts.length) {

    showToast(
      "Add at least one host."
    );

    return;
  }


  if (!state.vms.length) {

    showToast(
      "Add at least one VM."
    );

    return;
  }


  const algorithm =
    $("algorithmSelect")
      .value;


  state.lastAlgorithm =
    algorithm;


  state.lastResult =
    schedule(
      algorithm,
      state.hosts,
      state.vms
    );


  renderAll();


  $("lastRunText")
    .textContent =
    `
      Last run:
      ${
        algorithmInfo[
          algorithm
        ].name
      }

      •

      ${
        new Date()
          .toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )
      }
    `;


  document
    .querySelectorAll(
      ".host-card"
    )
    .forEach(
      (card, index) => {

        setTimeout(
          () =>
            card.classList.add(
              "flash"
            ),
          index * 40
        );


        setTimeout(
          () =>
            card.classList.remove(
              "flash"
            ),
          650 + index * 40
        );

      }
    );


  saveState();


  showToast(
    `${
      algorithmInfo[
        algorithm
      ].name
    } completed.`
  );

}


function compareAlgorithms() {

  if (
    !state.hosts.length ||
    !state.vms.length
  ) {

    showToast(
      "Add hosts and VMs before comparing."
    );

    return;
  }


  const algorithms = [

    "first-fit",
    "best-fit",
    "load-balanced"

  ];


  const results =
    algorithms.map(
      (algorithm) =>
        schedule(
          algorithm,
          cloneData(state.hosts),
          cloneData(state.vms)
        )
    );


  renderComparison(
    results
  );


  showToast(
    "All three algorithms compared."
  );

}


function deleteHost(
  encodedId
) {

  const id =
    decodeURIComponent(
      encodedId
    );


  state.hosts =
    state.hosts.filter(
      (host) =>
        host.id !== id
    );


  state.lastResult =
    null;


  saveState();

  renderAll();

}


function deleteVM(
  encodedId
) {

  const id =
    decodeURIComponent(
      encodedId
    );


  state.vms =
    state.vms.filter(
      (vm) =>
        vm.id !== id
    );


  state.lastResult =
    null;


  saveState();

  renderAll();

}


function openModal(type) {

  $("modalBackdrop")
    .classList
    .remove("hidden");


  if (type === "host") {

    $("modalContent")
      .innerHTML = `

        <h3>
          Add Cloud Host
        </h3>

        <p>
          Define the CPU and RAM
          capacity of a physical
          or virtual host.
        </p>

        <form
          class="modal-form"
          id="hostForm"
        >

          <label>

            Host ID

            <input
              class="input"
              id="hostIdInput"
              placeholder="Host-05"
              required
            />

          </label>


          <label>

            CPU Cores

            <input
              class="input"
              id="hostCpuInput"
              type="number"
              min="1"
              max="256"
              placeholder="16"
              required
            />

          </label>


          <label>

            RAM (GB)

            <input
              class="input"
              id="hostRamInput"
              type="number"
              min="1"
              max="1024"
              placeholder="32"
              required
            />

          </label>


          <div class="modal-actions">

            <button
              type="button"
              class="btn ghost"
              onclick="closeModal()"
            >
              Cancel
            </button>


            <button
              type="submit"
              class="btn primary"
            >
              Add Host
            </button>

          </div>

        </form>

      `;


    $("hostForm")
      .addEventListener(
        "submit",
        (event) => {

          event.preventDefault();


          const id =
            $("hostIdInput")
              .value
              .trim();


          const cpu =
            Number(
              $("hostCpuInput")
                .value
            );


          const ram =
            Number(
              $("hostRamInput")
                .value
            );


          if (
            !id ||
            cpu <= 0 ||
            ram <= 0
          ) {

            showToast(
              "Enter a valid host ID, CPU and RAM."
            );

            return;
          }


          if (
            state.hosts.some(
              (host) =>
                host.id
                  .toLowerCase() ===
                id.toLowerCase()
            )
          ) {

            showToast(
              "That Host ID already exists."
            );

            return;
          }


          state.hosts.push({

            id,
            cpu,
            ram

          });


          state.lastResult =
            null;


          saveState();

          renderAll();

          closeModal();


          showToast(
            `${id} added.`
          );

        }
      );

    return;
  }


  $("modalContent")
    .innerHTML = `

      <h3>
        Add Virtual Machine
      </h3>

      <p>
        Define the CPU and RAM
        resources required by
        the VM.
      </p>

      <form
        class="modal-form"
        id="vmForm"
      >

        <label>

          VM ID

          <input
            class="input"
            id="vmIdInput"
            placeholder="VM-11"
            required
          />

        </label>


        <label>

          CPU Cores

          <input
            class="input"
            id="vmCpuInput"
            type="number"
            min="1"
            max="256"
            placeholder="4"
            required
          />

        </label>


        <label>

          RAM (GB)

          <input
            class="input"
            id="vmRamInput"
            type="number"
            min="1"
            max="1024"
            placeholder="8"
            required
          />

        </label>


        <label>

          Priority

          <select
            class="input"
            id="vmPriorityInput"
          >

            <option>
              High
            </option>

            <option selected>
              Medium
            </option>

            <option>
              Low
            </option>

          </select>

        </label>


        <div class="modal-actions">

          <button
            type="button"
            class="btn ghost"
            onclick="closeModal()"
          >
            Cancel
          </button>


          <button
            type="submit"
            class="btn primary"
          >
            Add VM
          </button>

        </div>

      </form>

    `;


  $("vmForm")
    .addEventListener(
      "submit",
      (event) => {

        event.preventDefault();


        const id =
          $("vmIdInput")
            .value
            .trim();


        const cpu =
          Number(
            $("vmCpuInput")
              .value
          );


        const ram =
          Number(
            $("vmRamInput")
              .value
          );


        const priority =
          $("vmPriorityInput")
            .value;


        if (
          !id ||
          cpu <= 0 ||
          ram <= 0
        ) {

          showToast(
            "Enter a valid VM ID, CPU and RAM."
          );

          return;
        }


        if (
          state.vms.some(
            (vm) =>
              vm.id
                .toLowerCase() ===
              id.toLowerCase()
          )
        ) {

          showToast(
            "That VM ID already exists."
          );

          return;
        }


        state.vms.push({

          id,
          cpu,
          ram,
          priority

        });


        state.lastResult =
          null;


        saveState();

        renderAll();

        closeModal();


        showToast(
          `${id} added.`
        );

      }
    );

}


function closeModal() {

  $("modalBackdrop")
    .classList
    .add("hidden");

}


function escapeHtml(value) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================
   EVENT LISTENERS
========================= */

$("algorithmSelect")
  .addEventListener(
    "change",
    renderAlgorithmInfo
  );


$("runBtn")
  .addEventListener(
    "click",
    runScheduler
  );


$("sampleBtn")
  .addEventListener(
    "click",
    () =>
      generateSampleData(true)
  );


$("compareBtn")
  .addEventListener(
    "click",
    compareAlgorithms
  );


$("resetBtn")
  .addEventListener(
    "click",
    resetAll
  );


$("addHostBtn")
  .addEventListener(
    "click",
    () =>
      openModal("host")
  );


$("addVmBtn")
  .addEventListener(
    "click",
    () =>
      openModal("vm")
  );


$("modalClose")
  .addEventListener(
    "click",
    closeModal
  );


$("modalBackdrop")
  .addEventListener(
    "click",
    (event) => {

      if (
        event.target ===
        $("modalBackdrop")
      ) {

        closeModal();

      }

    }
  );


window.deleteHost =
  deleteHost;


window.deleteVM =
  deleteVM;


window.closeModal =
  closeModal;


/* START APP */

loadState();

renderAll();

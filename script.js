/* Pure scheduling engine. Works in browsers and Node.js; no UI dependencies. */
(function (root) {
  'use strict';

  const ALGORITHMS = ['first-fit', 'best-fit', 'load-balanced'];

  function finitePositive(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0;
  }

  function validateWorkload(hosts, vms) {
    if (!Array.isArray(hosts) || !Array.isArray(vms)) {
      throw new TypeError('Hosts and VMs must both be arrays.');
    }

    const hostIds = new Set();

    hosts.forEach((host, index) => {
      if (!host || typeof host.id !== 'string' || !host.id.trim()) {
        throw new TypeError(`Host ${index + 1} needs an ID.`);
      }

      if (!finitePositive(host.cpu) || !finitePositive(host.ram)) {
        throw new RangeError(`Host ${host.id} must have positive CPU and RAM capacity.`);
      }

      const key = host.id.trim().toLowerCase();
      if (hostIds.has(key)) throw new TypeError(`Duplicate host ID: ${host.id}`);
      hostIds.add(key);
    });

    const vmIds = new Set();

    vms.forEach((vm, index) => {
      if (!vm || typeof vm.id !== 'string' || !vm.id.trim()) {
        throw new TypeError(`VM ${index + 1} needs an ID.`);
      }

      if (!finitePositive(vm.cpu) || !finitePositive(vm.ram)) {
        throw new RangeError(`VM ${vm.id} must request positive CPU and RAM.`);
      }

      const key = vm.id.trim().toLowerCase();
      if (vmIds.has(key)) throw new TypeError(`Duplicate VM ID: ${vm.id}`);
      vmIds.add(key);
    });
  }

  function createWorkingHosts(hosts) {
    return hosts.map((host) => ({
      id: host.id,
      cpu: Number(host.cpu),
      ram: Number(host.ram),
      usedCpu: 0,
      usedRam: 0,
      remainingCpu: Number(host.cpu),
      remainingRam: Number(host.ram),
      vms: []
    }));
  }

  function canPlace(host, vm) {
    const cpu = Number(vm.cpu);
    const ram = Number(vm.ram);

    return host.remainingCpu >= cpu && host.remainingRam >= ram;
  }

  function placeVm(host, vm) {
    host.usedCpu += Number(vm.cpu);
    host.usedRam += Number(vm.ram);
    host.remainingCpu -= Number(vm.cpu);
    host.remainingRam -= Number(vm.ram);
    host.vms.push(vm.id);
  }

  function pressure(host, candidateVm) {
    const usedCpu = host.usedCpu + (candidateVm ? Number(candidateVm.cpu) : 0);
    const usedRam = host.usedRam + (candidateVm ? Number(candidateVm.ram) : 0);

    return Math.max(
      (usedCpu / host.cpu) * 100,
      (usedRam / host.ram) * 100
    );
  }

  function standardDeviation(values) {
    if (!values.length) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    const variance = values.reduce(
      (sum, value) => sum + ((value - mean) ** 2),
      0
    ) / values.length;

    return Math.sqrt(variance);
  }

  function buildResult(algorithm, workingHosts, allocations) {
    const failedVMs = allocations
      .filter((item) => item.status === 'Failed')
      .map((item) => item.vmId);

    const scheduled = allocations
      .filter((item) => item.status === 'Scheduled').length;

    const cpuUtils = workingHosts.map(
      (host) => (host.usedCpu / host.cpu) * 100
    );

    const ramUtils = workingHosts.map(
      (host) => (host.usedRam / host.ram) * 100
    );

    const pressures = workingHosts.map((host) => pressure(host));

    const average = (values) => values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

    const totalCpu = workingHosts.reduce((sum, host) => sum + host.cpu, 0);
    const totalRam = workingHosts.reduce((sum, host) => sum + host.ram, 0);

    const totalUsedCpu = workingHosts.reduce((sum, host) => sum + host.usedCpu, 0);
    const totalUsedRam = workingHosts.reduce((sum, host) => sum + host.usedRam, 0);

    return {
      algorithm,
      allocations,
      failedVMs,
      hosts: workingHosts,
      metrics: {
        totalVMs: allocations.length,
        scheduled,
        failed: failedVMs.length,

        // Every host receives equal weight in these two averages.
        avgCpu: average(cpuUtils),
        avgRam: average(ramUtils),

        // Weighted by the total capacity of the cluster.
        overallCpu: totalCpu ? (totalUsedCpu / totalCpu) * 100 : 0,
        overallRam: totalRam ? (totalUsedRam / totalRam) * 100 : 0,

        activeHosts: workingHosts.filter((host) => host.vms.length > 0).length,
        unusedHosts: workingHosts.filter((host) => host.vms.length === 0).length,

        loadImbalance: pressures.length
          ? Math.max(...pressures) - Math.min(...pressures)
          : 0,

        loadStdDev: standardDeviation(pressures)
      }
    };
  }

  function runFirstFit(workingHosts, vms) {
    const allocations = [];

    for (const vm of vms) {
      const host = workingHosts.find((candidate) => canPlace(candidate, vm));

      if (!host) {
        allocations.push({ vmId: vm.id, hostId: null, status: 'Failed' });
      } else {
        placeVm(host, vm);
        allocations.push({ vmId: vm.id, hostId: host.id, status: 'Scheduled' });
      }
    }

    return allocations;
  }

  function runBestFit(workingHosts, vms) {
    const allocations = [];

    for (const vm of vms) {
      let best = null;
      let bestScore = Infinity;

      for (const host of workingHosts) {
        if (!canPlace(host, vm)) continue;

        // Normalize leftover CPU and RAM by the host's capacity.
        // The resulting fractions are dimensionless and comparable.
        const score =
          ((host.remainingCpu - vm.cpu) / host.cpu) +
          ((host.remainingRam - vm.ram) / host.ram);

        if (score < bestScore - 1e-12) {
          best = host;
          bestScore = score;
        }
      }

      if (!best) {
        allocations.push({ vmId: vm.id, hostId: null, status: 'Failed' });
      } else {
        placeVm(best, vm);
        allocations.push({ vmId: vm.id, hostId: best.id, status: 'Scheduled' });
      }
    }

    return allocations;
  }

  function runLoadBalanced(workingHosts, vms) {
    const allocations = [];

    for (const vm of vms) {
      let bestIndex = -1;
      let bestStdDev = Infinity;
      let bestMean = Infinity;

      for (let index = 0; index < workingHosts.length; index += 1) {
        const candidate = workingHosts[index];
        if (!canPlace(candidate, vm)) continue;

        // Project the pressure of every host after this possible placement.
        const projected = workingHosts.map((host, hostIndex) =>
          pressure(host, hostIndex === index ? vm : null)
        );

        const deviation = standardDeviation(projected);
        const mean = projected.reduce((sum, value) => sum + value, 0)
          / (projected.length || 1);

        if (
          deviation < bestStdDev - 1e-9 ||
          (
            Math.abs(deviation - bestStdDev) <= 1e-9 &&
            mean < bestMean - 1e-9
          )
        ) {
          bestIndex = index;
          bestStdDev = deviation;
          bestMean = mean;
        }
      }

      if (bestIndex < 0) {
        allocations.push({ vmId: vm.id, hostId: null, status: 'Failed' });
      } else {
        const host = workingHosts[bestIndex];
        placeVm(host, vm);
        allocations.push({ vmId: vm.id, hostId: host.id, status: 'Scheduled' });
      }
    }

    return allocations;
  }

  function schedule(algorithm, hosts, vms) {
    validateWorkload(hosts, vms);

    const chosenAlgorithm = ALGORITHMS.includes(algorithm)
      ? algorithm
      : 'first-fit';

    const workingHosts = createWorkingHosts(hosts);

    const allocations = chosenAlgorithm === 'best-fit'
      ? runBestFit(workingHosts, vms)
      : chosenAlgorithm === 'load-balanced'
        ? runLoadBalanced(workingHosts, vms)
        : runFirstFit(workingHosts, vms);

    return buildResult(chosenAlgorithm, workingHosts, allocations);
  }

  const api = {
    ALGORITHMS,
    validateWorkload,
    createWorkingHosts,
    canPlace,
    schedule,
    buildResult
  };

  root.SchedulerCore = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

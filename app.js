// ==============================
// Sales Analytics Dashboard - App
// ==============================

(function () {
  'use strict';

  // ── Constants ──
  var STORAGE_KEY = 'salesDashboardData';
  var ROWS_PER_PAGE = 10;

  // ── State ──
  var sales = [];
  var filteredSales = [];
  var currentPage = 1;
  var sortColumn = 'date';
  var sortDirection = 'desc';
  var granularity = 'daily';
  var dateStart = null;
  var dateEnd = null;
  var deleteTargetId = null;

  // ── Chart instances ──
  var revenueChart = null;
  var categoryChart = null;
  var statusChart = null;
  var productsChart = null;

  // ── DOM References ──
  var els = {};

  // ── Utility helpers ──
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function formatCurrency(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(d) {
    var dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Storage ──
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      sales = raw ? JSON.parse(raw) : [];
    } catch (e) {
      sales = [];
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
  }

  // ── Toast ──
  function showToast(message, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };
    toast.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + message + '</span>';
    els.toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('toast-exit');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ── Filtering ──
  function applyFilters() {
    var search = els.searchInput.value.toLowerCase().trim();
    var statusF = els.statusFilter.value;
    var categoryF = els.categoryFilter.value;

    filteredSales = sales.filter(function (s) {
      // Date range
      if (dateStart && s.date < dateStart) return false;
      if (dateEnd && s.date > dateEnd) return false;
      // Status
      if (statusF !== 'all' && s.status !== statusF) return false;
      // Category
      if (categoryF !== 'all' && s.category !== categoryF) return false;
      // Search
      if (search) {
        var haystack = (s.customer + ' ' + s.product + ' ' + s.category).toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });

    // Sort
    filteredSales.sort(function (a, b) {
      var valA = a[sortColumn];
      var valB = b[sortColumn];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      var cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    currentPage = 1;
  }

  // ── KPI Calculations ──
  function updateKPIs() {
    var completedSales = filteredSales.filter(function (s) { return s.status === 'completed'; });
    var totalRevenue = completedSales.reduce(function (sum, s) { return sum + s.total; }, 0);
    var totalOrders = filteredSales.length;
    var avgOrder = totalOrders > 0 ? totalRevenue / completedSales.length : 0;
    var refunded = filteredSales.filter(function (s) { return s.status === 'refunded'; }).length;
    var refundRate = totalOrders > 0 ? (refunded / totalOrders) * 100 : 0;

    els.kpiRevenue.textContent = formatCurrency(totalRevenue);
    els.kpiOrders.textContent = totalOrders.toLocaleString();
    els.kpiAOV.textContent = formatCurrency(avgOrder || 0);
    els.kpiRefundRate.textContent = refundRate.toFixed(1) + '%';

    // Trends — compare to "previous period" (simple: first half vs second half of data)
    setTrend(els.kpiRevenueTrend, totalRevenue, computePrevRevenue());
    setTrend(els.kpiOrdersTrend, totalOrders, computePrevOrders());
    setTrend(els.kpiAOVTrend, avgOrder, computePrevAOV());
    setRefundTrend(els.kpiRefundTrend, refundRate);
  }

  function splitHalf() {
    if (filteredSales.length < 2) return { first: [], second: [] };
    var sorted = filteredSales.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var mid = Math.floor(sorted.length / 2);
    return { first: sorted.slice(0, mid), second: sorted.slice(mid) };
  }

  function computePrevRevenue() {
    var h = splitHalf();
    return h.first.filter(function (s) { return s.status === 'completed'; }).reduce(function (sum, s) { return sum + s.total; }, 0);
  }

  function computePrevOrders() {
    return splitHalf().first.length;
  }

  function computePrevAOV() {
    var items = splitHalf().first.filter(function (s) { return s.status === 'completed'; });
    if (items.length === 0) return 0;
    return items.reduce(function (sum, s) { return sum + s.total; }, 0) / items.length;
  }

  function setTrend(el, current, previous) {
    if (previous === 0 && current === 0) {
      el.className = 'kpi-trend neutral';
      el.textContent = 'No data';
      return;
    }
    if (previous === 0) {
      el.className = 'kpi-trend up';
      el.textContent = '↑ New';
      return;
    }
    var pct = ((current - previous) / previous) * 100;
    if (pct > 0) {
      el.className = 'kpi-trend up';
      el.textContent = '↑ ' + pct.toFixed(1) + '% vs prev period';
    } else if (pct < 0) {
      el.className = 'kpi-trend down';
      el.textContent = '↓ ' + Math.abs(pct).toFixed(1) + '% vs prev period';
    } else {
      el.className = 'kpi-trend neutral';
      el.textContent = '→ No change';
    }
  }

  function setRefundTrend(el, rate) {
    if (rate === 0) {
      el.className = 'kpi-trend up';
      el.textContent = '✓ No refunds';
    } else if (rate < 5) {
      el.className = 'kpi-trend up';
      el.textContent = '✓ Low refund rate';
    } else if (rate < 15) {
      el.className = 'kpi-trend neutral';
      el.textContent = '→ Moderate';
    } else {
      el.className = 'kpi-trend down';
      el.textContent = '↓ High refund rate';
    }
  }

  // ── Charts ──
  var chartColors = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
  ];

  function updateRevenueChart() {
    var completedSales = filteredSales.filter(function (s) { return s.status === 'completed'; });
    var grouped = {};

    completedSales.forEach(function (s) {
      var key;
      if (granularity === 'daily') {
        key = s.date;
      } else if (granularity === 'weekly') {
        var d = new Date(s.date + 'T00:00:00');
        var day = d.getDay();
        var diff = d.getDate() - day + (day === 0 ? -6 : 1);
        var monday = new Date(d.setDate(diff));
        key = monday.toISOString().split('T')[0];
      } else {
        key = s.date.substring(0, 7);
      }
      grouped[key] = (grouped[key] || 0) + s.total;
    });

    var keys = Object.keys(grouped).sort();
    var labels = keys.map(function (k) {
      if (granularity === 'monthly') {
        var parts = k.split('-');
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[parseInt(parts[1]) - 1] + ' ' + parts[0];
      }
      return formatDate(k);
    });
    var data = keys.map(function (k) { return grouped[k]; });

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenueChart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Revenue',
          data: data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6366f1',
          borderWidth: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (ctx) { return formatCurrency(ctx.parsed.y); }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 11 }, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#94a3b8',
              font: { size: 11 },
              callback: function (v) { return '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v); }
            }
          }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }

  function updateCategoryChart() {
    var grouped = {};
    filteredSales.filter(function (s) { return s.status === 'completed'; }).forEach(function (s) {
      grouped[s.category] = (grouped[s.category] || 0) + s.total;
    });

    var labels = Object.keys(grouped);
    var data = labels.map(function (k) { return grouped[k]; });

    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(document.getElementById('categoryChart'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: chartColors.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (ctx) {
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ctx.label + ': ' + formatCurrency(ctx.parsed) + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  function updateStatusChart() {
    var statusCounts = { completed: 0, pending: 0, refunded: 0 };
    filteredSales.forEach(function (s) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });

    if (statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('statusChart'), {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending', 'Refunded'],
        datasets: [{
          data: [statusCounts.completed, statusCounts.pending, statusCounts.refunded],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (ctx) {
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                return ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  function updateProductsChart() {
    var grouped = {};
    filteredSales.filter(function (s) { return s.status === 'completed'; }).forEach(function (s) {
      grouped[s.product] = (grouped[s.product] || 0) + s.total;
    });

    var sorted = Object.entries(grouped).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var labels = sorted.map(function (e) { return e[0]; });
    var data = sorted.map(function (e) { return e[1]; });

    if (productsChart) productsChart.destroy();
    productsChart = new Chart(document.getElementById('productsChart'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Revenue',
          data: data,
          backgroundColor: chartColors.slice(0, labels.length).map(function (c) { return c + '33'; }),
          borderColor: chartColors.slice(0, labels.length),
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (ctx) { return formatCurrency(ctx.parsed.x); }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#94a3b8',
              font: { size: 11 },
              callback: function (v) { return '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v); }
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#334155', font: { size: 11 } }
          }
        }
      }
    });
  }

  function updateAllCharts() {
    updateRevenueChart();
    updateCategoryChart();
    updateStatusChart();
    updateProductsChart();
  }

  // ── Table ──
  function renderTable() {
    var tbody = els.tableBody;
    var totalPages = Math.max(1, Math.ceil(filteredSales.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    var startIdx = (currentPage - 1) * ROWS_PER_PAGE;
    var pageData = filteredSales.slice(startIdx, startIdx + ROWS_PER_PAGE);

    if (filteredSales.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' +
        '<p>No transactions found</p>' +
        '<small>Add a sale or generate sample data to get started</small>' +
        '</div></td></tr>';
    } else {
      tbody.innerHTML = pageData.map(function (s) {
        return '<tr>' +
          '<td>' + formatDate(s.date) + '</td>' +
          '<td>' + escapeHtml(s.customer) + '</td>' +
          '<td>' + escapeHtml(s.product) + '</td>' +
          '<td>' + escapeHtml(s.category) + '</td>' +
          '<td>' + s.quantity + '</td>' +
          '<td>' + formatCurrency(s.unitPrice) + '</td>' +
          '<td><strong>' + formatCurrency(s.total) + '</strong></td>' +
          '<td><span class="status-badge status-' + s.status + '"><span class="status-dot"></span>' + capitalize(s.status) + '</span></td>' +
          '<td><div class="action-btns">' +
          '<button class="action-btn edit" data-id="' + s.id + '" title="Edit">✎</button>' +
          '<button class="action-btn delete" data-id="' + s.id + '" title="Delete">✕</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');
    }

    // Info
    var showing = filteredSales.length === 0 ? 0 : startIdx + 1;
    var showingEnd = Math.min(startIdx + ROWS_PER_PAGE, filteredSales.length);
    els.tableInfo.textContent = 'Showing ' + showing + '-' + showingEnd + ' of ' + filteredSales.length + ' entries';

    // Pagination
    renderPagination(totalPages);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderPagination(totalPages) {
    var pag = els.pagination;
    pag.innerHTML = '';

    if (totalPages <= 1) return;

    var prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = '←';
    prev.disabled = currentPage === 1;
    prev.addEventListener('click', function () { currentPage--; renderTable(); });
    pag.appendChild(prev);

    var startPage = Math.max(1, currentPage - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (var i = startPage; i <= endPage; i++) {
      (function (page) {
        var btn = document.createElement('button');
        btn.className = 'page-btn' + (page === currentPage ? ' active' : '');
        btn.textContent = page;
        btn.addEventListener('click', function () { currentPage = page; renderTable(); });
        pag.appendChild(btn);
      })(i);
    }

    var next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = '→';
    next.disabled = currentPage === totalPages;
    next.addEventListener('click', function () { currentPage++; renderTable(); });
    pag.appendChild(next);
  }

  // ── Category Filter Dropdown ──
  function updateCategoryDropdown() {
    var categories = {};
    sales.forEach(function (s) { categories[s.category] = true; });
    var opts = '<option value="all">All Categories</option>';
    Object.keys(categories).sort().forEach(function (c) {
      opts += '<option value="' + c + '">' + c + '</option>';
    });
    els.categoryFilter.innerHTML = opts;
  }

  // ── Modal ──
  function openSaleModal(sale) {
    els.saleModal.classList.add('show');
    if (sale) {
      els.modalTitle.textContent = 'Edit Sale';
      els.saleId.value = sale.id;
      els.saleDate.value = sale.date;
      els.saleCustomer.value = sale.customer;
      els.saleProduct.value = sale.product;
      els.saleCategory.value = sale.category;
      els.saleQuantity.value = sale.quantity;
      els.saleUnitPrice.value = sale.unitPrice;
      els.saleStatus.value = sale.status;
    } else {
      els.modalTitle.textContent = 'Add New Sale';
      els.saleId.value = '';
      els.saleForm.reset();
      els.saleDate.value = new Date().toISOString().split('T')[0];
      els.saleStatus.value = 'completed';
    }
    updateComputedTotal();
  }

  function closeSaleModal() {
    els.saleModal.classList.remove('show');
  }

  function updateComputedTotal() {
    var qty = parseInt(els.saleQuantity.value) || 0;
    var price = parseFloat(els.saleUnitPrice.value) || 0;
    els.computedTotal.textContent = formatCurrency(qty * price);
  }

  function saveSale(e) {
    e.preventDefault();
    var id = els.saleId.value;
    var qty = parseInt(els.saleQuantity.value);
    var price = parseFloat(els.saleUnitPrice.value);

    var saleObj = {
      id: id || generateId(),
      date: els.saleDate.value,
      customer: els.saleCustomer.value.trim(),
      product: els.saleProduct.value.trim(),
      category: els.saleCategory.value,
      quantity: qty,
      unitPrice: price,
      total: qty * price,
      status: els.saleStatus.value
    };

    if (id) {
      var idx = sales.findIndex(function (s) { return s.id === id; });
      if (idx !== -1) sales[idx] = saleObj;
      showToast('Sale updated successfully');
    } else {
      sales.push(saleObj);
      showToast('Sale added successfully');
    }

    saveData();
    closeSaleModal();
    refreshAll();
  }

  // ── Delete ──
  function openDeleteModal(id) {
    deleteTargetId = id;
    els.deleteModal.classList.add('show');
  }

  function closeDeleteModal() {
    deleteTargetId = null;
    els.deleteModal.classList.remove('show');
  }

  function confirmDelete() {
    if (deleteTargetId) {
      sales = sales.filter(function (s) { return s.id !== deleteTargetId; });
      saveData();
      showToast('Transaction deleted', 'info');
      closeDeleteModal();
      refreshAll();
    }
  }

  // ── Sample Data ──
  function generateSampleData() {
    var customers = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson', 'Eva Brown',
      'Frank Lee', 'Grace Kim', 'Henry Chen', 'Iris Patel', 'Jake Thompson',
      'Karen White', 'Leo Martin', 'Mia Garcia', 'Noah Clark', 'Olivia Adams'];

    var products = [
      { name: 'Wireless Headphones', category: 'Electronics', price: 79.99 },
      { name: 'Laptop Stand', category: 'Electronics', price: 45.00 },
      { name: 'Mechanical Keyboard', category: 'Electronics', price: 129.99 },
      { name: 'USB-C Hub', category: 'Electronics', price: 34.99 },
      { name: '4K Monitor', category: 'Electronics', price: 349.99 },
      { name: 'Running Shoes', category: 'Sports', price: 89.99 },
      { name: 'Yoga Mat', category: 'Sports', price: 29.99 },
      { name: 'Dumbbell Set', category: 'Sports', price: 149.99 },
      { name: 'Winter Jacket', category: 'Clothing', price: 119.99 },
      { name: 'Cotton T-Shirt', category: 'Clothing', price: 24.99 },
      { name: 'Denim Jeans', category: 'Clothing', price: 59.99 },
      { name: 'Desk Lamp', category: 'Home & Garden', price: 39.99 },
      { name: 'Plant Pot Set', category: 'Home & Garden', price: 22.99 },
      { name: 'Coffee Table', category: 'Home & Garden', price: 199.99 },
      { name: 'Organic Coffee', category: 'Food & Beverage', price: 14.99 },
      { name: 'Protein Bars (12pk)', category: 'Food & Beverage', price: 24.99 },
      { name: 'Green Tea Set', category: 'Food & Beverage', price: 18.99 },
      { name: 'JavaScript Guide', category: 'Books', price: 39.99 },
      { name: 'Design Patterns', category: 'Books', price: 44.99 },
      { name: 'Project Manager Pro', category: 'Software', price: 99.99 },
      { name: 'Photo Editor Suite', category: 'Software', price: 69.99 }
    ];

    var statuses = ['completed', 'completed', 'completed', 'completed', 'completed',
      'completed', 'completed', 'pending', 'pending', 'refunded'];

    var now = new Date();
    var newSales = [];

    for (var i = 0; i < 120; i++) {
      var daysAgo = Math.floor(Math.random() * 180);
      var date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      var dateStr = date.toISOString().split('T')[0];

      var product = products[Math.floor(Math.random() * products.length)];
      var customer = customers[Math.floor(Math.random() * customers.length)];
      var qty = Math.floor(Math.random() * 5) + 1;
      var status = statuses[Math.floor(Math.random() * statuses.length)];
      var priceVariation = product.price * (0.9 + Math.random() * 0.2);

      newSales.push({
        id: generateId(),
        date: dateStr,
        customer: customer,
        product: product.name,
        category: product.category,
        quantity: qty,
        unitPrice: Math.round(priceVariation * 100) / 100,
        total: Math.round(qty * priceVariation * 100) / 100,
        status: status
      });
    }

    sales = newSales;
    saveData();
    showToast('Generated 120 sample transactions', 'success');
    refreshAll();
  }

  // ── Export / Import ──
  function exportData() {
    if (sales.length === 0) {
      showToast('No data to export', 'error');
      return;
    }
    var blob = new Blob([JSON.stringify(sales, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sales-data-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully');
  }

  function importData(e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        // Validate each entry
        imported.forEach(function (s) {
          if (!s.id) s.id = generateId();
          if (!s.date || !s.product || !s.customer) throw new Error('Missing fields');
        });
        sales = imported;
        saveData();
        showToast('Imported ' + sales.length + ' transactions', 'success');
        refreshAll();
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function clearAllData() {
    if (sales.length === 0) {
      showToast('No data to clear', 'info');
      return;
    }
    sales = [];
    saveData();
    showToast('All data cleared', 'info');
    refreshAll();
  }

  // ── Refresh Everything ──
  function refreshAll() {
    updateCategoryDropdown();
    applyFilters();
    updateKPIs();
    updateAllCharts();
    renderTable();
  }

  // ── Sorting ──
  function handleSort(e) {
    var th = e.target.closest('th.sortable');
    if (!th) return;
    var col = th.dataset.sort;

    // Remove sorted classes from all
    document.querySelectorAll('.data-table th').forEach(function (t) {
      t.classList.remove('sorted-asc', 'sorted-desc');
    });

    if (sortColumn === col) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = col;
      sortDirection = 'asc';
    }

    th.classList.add('sorted-' + sortDirection);
    applyFilters();
    renderTable();
  }

  // ── Table action delegation ──
  function handleTableAction(e) {
    var editBtn = e.target.closest('.action-btn.edit');
    var deleteBtn = e.target.closest('.action-btn.delete');

    if (editBtn) {
      var sale = sales.find(function (s) { return s.id === editBtn.dataset.id; });
      if (sale) openSaleModal(sale);
    }

    if (deleteBtn) {
      openDeleteModal(deleteBtn.dataset.id);
    }
  }

  // ── Granularity chips ──
  function handleGranularity(e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chart-actions .chip').forEach(function (c) {
      c.classList.remove('active');
    });
    chip.classList.add('active');
    granularity = chip.dataset.granularity;
    updateRevenueChart();
  }

  // ── Init ──
  function init() {
    // Cache DOM elements
    els.searchInput = document.getElementById('searchInput');
    els.statusFilter = document.getElementById('statusFilter');
    els.categoryFilter = document.getElementById('categoryFilter');
    els.tableBody = document.getElementById('tableBody');
    els.tableInfo = document.getElementById('tableInfo');
    els.pagination = document.getElementById('pagination');
    els.toastContainer = document.getElementById('toastContainer');
    els.saleModal = document.getElementById('saleModal');
    els.deleteModal = document.getElementById('deleteModal');
    els.modalTitle = document.getElementById('modalTitle');
    els.saleForm = document.getElementById('saleForm');
    els.saleId = document.getElementById('saleId');
    els.saleDate = document.getElementById('saleDate');
    els.saleCustomer = document.getElementById('saleCustomer');
    els.saleProduct = document.getElementById('saleProduct');
    els.saleCategory = document.getElementById('saleCategory');
    els.saleQuantity = document.getElementById('saleQuantity');
    els.saleUnitPrice = document.getElementById('saleUnitPrice');
    els.saleStatus = document.getElementById('saleStatus');
    els.computedTotal = document.getElementById('computedTotal');
    els.kpiRevenue = document.getElementById('kpiRevenue');
    els.kpiOrders = document.getElementById('kpiOrders');
    els.kpiAOV = document.getElementById('kpiAOV');
    els.kpiRefundRate = document.getElementById('kpiRefundRate');
    els.kpiRevenueTrend = document.getElementById('kpiRevenueTrend');
    els.kpiOrdersTrend = document.getElementById('kpiOrdersTrend');
    els.kpiAOVTrend = document.getElementById('kpiAOVTrend');
    els.kpiRefundTrend = document.getElementById('kpiRefundTrend');

    // Load data — auto-generate sample data on first visit
    loadData();
    if (sales.length === 0) {
      generateSampleData();
    }

    // ── Event Listeners ──

    // Add sale button
    document.getElementById('btnAddSale').addEventListener('click', function () { openSaleModal(null); });

    // Modal close/cancel
    document.getElementById('btnCloseModal').addEventListener('click', closeSaleModal);
    document.getElementById('btnCancelModal').addEventListener('click', closeSaleModal);
    els.saleModal.addEventListener('click', function (e) {
      if (e.target === els.saleModal) closeSaleModal();
    });

    // Delete modal
    document.getElementById('btnCloseDelete').addEventListener('click', closeDeleteModal);
    document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
    document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);
    els.deleteModal.addEventListener('click', function (e) {
      if (e.target === els.deleteModal) closeDeleteModal();
    });

    // Save sale
    els.saleForm.addEventListener('submit', saveSale);

    // Computed total
    els.saleQuantity.addEventListener('input', updateComputedTotal);
    els.saleUnitPrice.addEventListener('input', updateComputedTotal);

    // Search & filters
    els.searchInput.addEventListener('input', debounce(function () {
      applyFilters();
      updateKPIs();
      updateAllCharts();
      renderTable();
    }, 300));

    els.statusFilter.addEventListener('change', function () {
      applyFilters();
      updateKPIs();
      updateAllCharts();
      renderTable();
    });

    els.categoryFilter.addEventListener('change', function () {
      applyFilters();
      updateKPIs();
      updateAllCharts();
      renderTable();
    });

    // Date filter
    document.getElementById('btnApplyDate').addEventListener('click', function () {
      dateStart = document.getElementById('startDate').value || null;
      dateEnd = document.getElementById('endDate').value || null;
      applyFilters();
      updateKPIs();
      updateAllCharts();
      renderTable();
      if (dateStart || dateEnd) showToast('Date filter applied', 'info');
    });

    document.getElementById('btnResetDate').addEventListener('click', function () {
      dateStart = null;
      dateEnd = null;
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      applyFilters();
      updateKPIs();
      updateAllCharts();
      renderTable();
      showToast('Date filter cleared', 'info');
    });

    // Table sort
    document.querySelector('.data-table thead').addEventListener('click', handleSort);

    // Table actions (edit/delete)
    els.tableBody.addEventListener('click', handleTableAction);

    // Granularity chips
    document.querySelector('.chart-actions').addEventListener('click', handleGranularity);

    // Dropdown menu
    var dropdownBtn = document.getElementById('btnMore');
    var dropdownMenu = document.getElementById('dropdownMenu');
    dropdownBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });
    document.addEventListener('click', function () {
      dropdownMenu.classList.remove('show');
    });

    // Dropdown actions
    document.getElementById('btnGenerateSample').addEventListener('click', function () {
      dropdownMenu.classList.remove('show');
      generateSampleData();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      dropdownMenu.classList.remove('show');
      exportData();
    });
    document.getElementById('btnImport').addEventListener('click', function () {
      dropdownMenu.classList.remove('show');
      document.getElementById('fileImport').click();
    });
    document.getElementById('fileImport').addEventListener('change', importData);
    document.getElementById('btnClearAll').addEventListener('click', function () {
      dropdownMenu.classList.remove('show');
      clearAllData();
    });

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeSaleModal();
        closeDeleteModal();
      }
    });

    // ── Initial render ──
    refreshAll();
  }

  // ── Debounce helper ──
  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();


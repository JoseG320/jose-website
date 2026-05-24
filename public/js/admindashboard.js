(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="csrf-token"]');
  if (!metaTag) {
    console.error('[admindashboard] No CSRF meta tag found.');
    return;
  }
  var csrf = metaTag.getAttribute('content');

  function apiPost(url) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-csrf-token': csrf,
        'x-requested-with': 'xmlhttprequest',
      },
      body: '_csrf=' + encodeURIComponent(csrf),
    }).then(function (res) {
      if (!res.ok) return false;
      return res.json().then(function (j) { return j.ok === true; });
    }).catch(function () { return false; });
  }

  function updateBadge(delta) {
    var badge = document.getElementById('unread-badge');
    if (!badge) return;
    if (delta === null) { badge.remove(); return; }
    var next = (parseInt(badge.textContent) || 0) + delta;
    if (next <= 0) badge.remove();
    else badge.textContent = next + ' new';
  }

  function checkEmpty() {
    var list = document.getElementById('messages-list');
    if (list && !list.querySelector('.msg-card')) {
      list.innerHTML = '<p style="color:var(--muted);">No messages yet.</p>';
      var pager = document.getElementById('messages-pager');
      if (pager) pager.innerHTML = '';
    }
  }

  function bindCard(card) {

    var readBtn = card.querySelector('.msg-read-btn');
    if (readBtn) {
      readBtn.addEventListener('click', function () {
        var id = this.dataset.id;
        var btn = this;
        apiPost('/admin/message/' + id + '/read').then(function (ok) {
          if (!ok) { alert('Failed. Please refresh and try again.'); return; }
          card.style.borderLeftColor = 'var(--border)';
          card.dataset.unread = 'false';
          btn.remove();
          updateBadge(-1);
        });
      });
    }

    var delBtn = card.querySelector('.msg-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        if (!confirm('Delete this message?')) return;
        var id = this.dataset.id;
        var wasUnread = card.dataset.unread === 'true';
        apiPost('/admin/message/' + id + '/delete').then(function (ok) {
          if (!ok) { alert('Failed. Please refresh and try again.'); return; }
          card.remove();
          if (wasUnread) updateBadge(-1);
          checkEmpty();
        });
      });
    }
  }

  document.querySelectorAll('.msg-card').forEach(bindCard);

  var readAllBtn = document.getElementById('read-all-btn');
  if (readAllBtn) {
    readAllBtn.addEventListener('click', function () {
      if (!confirm('Mark all messages as read?')) return;
      apiPost('/admin/messages/read-all').then(function (ok) {
        if (!ok) { alert('Failed. Please refresh and try again.'); return; }
        document.querySelectorAll('.msg-card').forEach(function (card) {
          card.style.borderLeftColor = 'var(--border)';
          card.dataset.unread = 'false';
          var rb = card.querySelector('.msg-read-btn');
          if (rb) rb.remove();
        });
        updateBadge(null);
      });
    });
  }

  var deleteAllBtn = document.getElementById('delete-all-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', function () {
      if (!confirm('Delete all messages? This cannot be undone.')) return;
      apiPost('/admin/messages/delete-all').then(function (ok) {
        if (!ok) { alert('Failed. Please refresh and try again.'); return; }
        document.querySelectorAll('.msg-card').forEach(function (c) { c.remove(); });
        updateBadge(null);
        checkEmpty();
      });
    });
  }

  function bindPager() {
    document.querySelectorAll('.page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = this.dataset.page;
        fetch('/admin?page=' + page, {
          credentials: 'same-origin',
        }).then(function (res) {
          return res.text();
        }).then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var newList  = doc.getElementById('messages-list');
          var newPager = doc.getElementById('messages-pager');
          var oldList  = document.getElementById('messages-list');
          var oldPager = document.getElementById('messages-pager');
          if (newList  && oldList)  oldList.replaceWith(newList);
          if (newPager && oldPager) oldPager.replaceWith(newPager);
          document.querySelectorAll('.msg-card').forEach(bindCard);
          bindPager();
        }).catch(function (err) {
          console.error('[admindashboard] Pagination error:', err);
        });
      });
    });
  }
  bindPager();

  // Resume forms
  document.querySelectorAll('.resume-activate-form, .resume-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.classList.contains('resume-delete-form')) {
        if (!confirm('Delete this resume? This cannot be undone.')) return;
      }
      fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf, 'x-requested-with': 'xmlhttprequest' },
        body: new FormData(form),
      }).finally(function () {
        window.location.replace('/admin');
      });
    });
  });

  document.querySelectorAll('.resume-upload-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf, 'x-requested-with': 'xmlhttprequest' },
        body: new FormData(form),
      }).finally(function () {
        window.location.replace('/admin');
      });
    });
  });

})();
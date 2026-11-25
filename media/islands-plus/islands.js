/*
 * UnIntelliJ Islands+ — loaded by VS Code's workbench.html when Islands+ is enabled.
 * Moves UnIntelliJ's project, branch and run status bar items into the title bar, where IntelliJ's
 * New UI shows them. VS Code keeps updating the moved elements; if it re-inserts one in the status
 * bar, the observer moves it back. No HTML strings are used (VS Code enforces Trusted Types).
 *
 * Islands+ only applies while UnIntelliJ runs: the extension shows a hidden "unintellij.alive" status
 * bar entry. When it is missing (UnIntelliJ disabled, or not started after a grace period), the
 * stylesheet is switched off and VS Code looks standard again, without restarting.
 */
(function () {
  'use strict';

  var LEFT = ['unintellij.project', 'unintellij.branch.name'];
  var RIGHT = ['unintellij.run.selector', 'unintellij.run.run', 'unintellij.run.debug', 'unintellij.run.stop'];

  function findItem(id) {
    // Status bar entries are identified by "<extension id>.<item id>".
    return document.querySelector('[id$="' + id + '"].statusbar-item') || document.querySelector('.statusbar-item[id$="' + id + '"]');
  }

  function container(side) {
    var titlebar = document.querySelector('.part.titlebar');
    if (!titlebar) {
      return undefined;
    }
    var existing = titlebar.querySelector('.unintellij-titlebar-widgets.' + side);
    if (existing) {
      return existing;
    }
    var host = titlebar.querySelector(side === 'left' ? '.titlebar-left' : '.titlebar-right');
    if (!host) {
      return undefined;
    }
    var element = document.createElement('div');
    element.className = 'unintellij-titlebar-widgets ' + side;
    if (side === 'left') {
      host.appendChild(element);
    } else {
      host.insertBefore(element, host.firstChild);
    }
    return element;
  }

  function place(ids, side) {
    var target = container(side);
    if (!target) {
      return;
    }
    ids.forEach(function (id) {
      var item = findItem(id);
      if (item && item.parentElement !== target) {
        target.appendChild(item);
      }
    });
    // Keep the declared order.
    ids.forEach(function (id) {
      var item = findItem(id);
      if (item && item.parentElement === target) {
        target.appendChild(item);
      }
    });
  }

  /** IntelliJ colors the branch widget counts: blue ↙ incoming, green ↗ outgoing. */
  function colorCounts() {
    var item = findItem('unintellij.branch.name');
    if (!item) {
      return;
    }
    var walker = document.createTreeWalker(item, window.NodeFilter.SHOW_TEXT);
    var nodes = [];
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/[↙↗]\d/.test(node.nodeValue) && !(node.parentElement && node.parentElement.classList.contains('unintellij-count'))) {
        nodes.push(node);
      }
    }
    nodes.forEach(function (textNode) {
      var parts = textNode.nodeValue.split(/([↙↗]\d+)/);
      var fragment = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) {
          return;
        }
        if (/^[↙↗]\d+$/.test(part)) {
          var span = document.createElement('span');
          span.className = 'unintellij-count ' + (part[0] === '↙' ? 'incoming' : 'outgoing');
          span.textContent = part;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  var ALIVE = 'unintellij.alive';
  /** Time UnIntelliJ gets to start before Islands+ is switched off (extensions start after the window). */
  var GRACE_MS = 30000;
  var started = Date.now();
  var seen = false;

  /** Switches the stylesheet and the moved widgets on or off; returns whether Islands+ is active. */
  function checkAlive() {
    var alive = !!findItem(ALIVE);
    seen = seen || alive;
    var active = alive || (!seen && Date.now() - started < GRACE_MS);
    var sheet = document.querySelector('link[href$="unintellij-islands.css"]');
    if (sheet && sheet.disabled === active) {
      sheet.disabled = !active;
    }
    document.querySelectorAll('.unintellij-titlebar-widgets').forEach(function (element) {
      element.style.display = active ? '' : 'none';
    });
    return active;
  }

  var scheduled = false;
  function sync() {
    scheduled = false;
    if (!checkAlive()) {
      return;
    }
    place(LEFT, 'left');
    place(RIGHT, 'right');
    colorCounts();
  }

  new MutationObserver(function () {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(sync);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  // UnIntelliJ never started: switch off once the grace period is over, even if nothing changes.
  window.setTimeout(sync, GRACE_MS + 500);
})();

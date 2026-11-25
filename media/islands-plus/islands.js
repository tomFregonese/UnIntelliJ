/*
 * UnIntelliJ Islands+ — loaded by VS Code's workbench.html when Islands+ is enabled.
 * Moves UnIntelliJ's project, branch and run status bar items into the title bar, where IntelliJ's
 * New UI shows them. VS Code keeps updating the moved elements; if it re-inserts one in the status
 * bar, the observer moves it back. No HTML strings are used (VS Code enforces Trusted Types).
 */
(function () {
  'use strict';

  var LEFT = ['unintellij.project', 'unintellij.branch.name', 'unintellij.branch.outgoing', 'unintellij.branch.incoming', 'unintellij.branch.update', 'unintellij.branch.push', 'unintellij.branch.fetch'];
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

  var scheduled = false;
  function sync() {
    scheduled = false;
    place(LEFT, 'left');
    place(RIGHT, 'right');
  }

  new MutationObserver(function () {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(sync);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

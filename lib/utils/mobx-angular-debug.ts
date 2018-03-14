/* tslint:disable:max-line-length */
/* tslint:disable:no-console */
import { getDebugName, getDependencyTree, spy, isObservableArray, isObservableObject } from 'mobx';

// function for turning debug on / off
export const mobxAngularDebug = (() => {
  const isLocalStorageAllowed = function () {
      try {
          window.localStorage.setItem('test', 'test');
          window.localStorage.removeItem('test');
          return false;
      } catch (ex) {
          return true
      }
  }

  if (isLocalStorageAllowed || typeof localStorage === 'undefined' || typeof console === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  if (!localStorage || !console || !window) {
    return () => {};
  }

  const style = 'background: #222; color: #bada55';

  window['mobxAngularDebug'] = (value) => {
    if (value) {
        console.log('%c MobX will now log everything to the console', style);
        console.log('%c Right-click any element to see its dependency tree', style);
        localStorage['mobx-angular-debug'] = true;
    }
    else delete localStorage['mobx-angular-debug'];
  };

  function isDebugOn() {
    return localStorage['mobx-angular-debug'];
  }

  spy((change) => isDebugOn() && consoleLogChange(change, () => true));

  // Debugging element dependency tree
  function mobxAngularDebug(view, renderer, observer) {
    const element = view.rootNodes[0];

    renderer.listen(element, 'contextmenu', () => {
        if (isDebugOn()) console.log(getDependencyTree(observer));
    });
  }

  /////////////////////////////////////////////////////////
  // console logging (copied from mobx-react)
  let advicedToUseChrome = false;

  let currentDepth = 0;
  let isInsideSkippedGroup = false;

  function consoleLogChange(change, filter) {

      if (advicedToUseChrome === false && typeof navigator !== 'undefined' && navigator.userAgent.indexOf('Chrome') === -1) {
          console.warn('The output of the MobX logger is optimized for Chrome');
          advicedToUseChrome = true;
      }

      const isGroupStart = change.spyReportStart === true;
      const isGroupEnd = change.spyReportEnd === true;

      let show;
      if (currentDepth === 0) {
          show = filter(change);
          if (isGroupStart && !show) { isInsideSkippedGroup = true; }
      } else if (isGroupEnd && isInsideSkippedGroup && currentDepth === 1) {
          show = false;
          isInsideSkippedGroup = false;
      } else {
          show = isInsideSkippedGroup !== true;
      }

      if (show && isGroupEnd) {
          groupEnd(change.time);
      } else if (show) {
          const logNext: any = isGroupStart ? group : log;
          switch (change.type) {
              case 'action':
                  // name, target, arguments, fn
                  logNext(`%caction '%s' %s`, 'color:dodgerblue', change.name, autoWrap('(', getNameForThis(change.target)));
                  log(change.arguments);
                  trace();
                  break;
              case 'transaction':
                  // name, target
                  logNext(`%ctransaction '%s' %s`, 'color:gray', change.name, autoWrap('(', getNameForThis(change.target)));
                  break;
              case 'scheduled-reaction':
                  // object
                  logNext(`%cscheduled async reaction '%s'`, 'color:#10a210', observableName(change.object));
                  break;
              case 'reaction':
                  // object, fn
                  logNext(`%creaction '%s'`, 'color:#10a210', observableName(change.object));
                  // dir({
                  //     fn: change.fn
                  // });
                  trace();
                  break;
              case 'compute':
                  // object, target, fn
                  group(`%ccomputed '%s' %s`, 'color:#10a210', observableName(change.object), autoWrap('(', getNameForThis(change.target)));
                  // dir({
                  //    fn: change.fn,
                  //    target: change.target
                  // });
                  groupEnd();
                  break;
              case 'error':
                  // message
                  logNext('%cerror: %s', 'color:tomato', change.message);
                  trace();
                  closeGroupsOnError();
                  break;
              case 'update':
                  // (array) object, index, newValue, oldValue
                  // (map, obbject) object, name, newValue, oldValue
                  // (value) object, newValue, oldValue
                  if (isObservableArray(change.object)) {
                      logNext('updated \'%s[%s]\': %s (was: %s)', observableName(change.object), change.index, formatValue(change.newValue), formatValue(change.oldValue));
                  } else if (isObservableObject(change.object)) {
                      logNext('updated \'%s.%s\': %s (was: %s)', observableName(change.object), change.name, formatValue(change.newValue), formatValue(change.oldValue));
                  } else {
                      logNext('updated \'%s\': %s (was: %s)', observableName(change.object), change.name, formatValue(change.newValue), formatValue(change.oldValue));
                  }
                  dir({
                      newValue: change.newValue,
                      oldValue: change.oldValue
                  });
                  trace();
                  break;
              case 'splice':
                  // (array) object, index, added, removed, addedCount, removedCount
                  logNext('spliced \'%s\': index %d, added %d, removed %d', observableName(change.object), change.index, change.addedCount, change.removedCount);
                  dir({
                      added: change.added,
                      removed: change.removed
                  });
                  trace();
                  break;
              case 'add':
                  // (map, object) object, name, newValue
                  logNext('set \'%s.%s\': %s', observableName(change.object), change.name, formatValue(change.newValue));
                  dir({
                      newValue: change.newValue
                  });
                  trace();
                  break;
              case 'delete':
                  // (map) object, name, oldValue
                  logNext('removed \'%s.%s\' (was %s)', observableName(change.object), change.name, formatValue(change.oldValue));
                  dir({
                      oldValue: change.oldValue
                  });
                  trace();
                  break;
              case 'create':
                  // (value) object, newValue
                  logNext('set \'%s\': %s', observableName(change.object), formatValue(change.newValue));
                  dir({
                      newValue: change.newValue
                  });
                  trace();
                  break;
              default:
                  // generic fallback for future events
                  logNext(change.type);
                  dir(change);
                  break;
          }
      }

      if (isGroupStart) currentDepth++;
      if (isGroupEnd) currentDepth--;
  }

  const consoleSupportsGroups = false; // typeof console.groupCollapsed === 'function';
  let currentlyLoggedDepth = 0;

  function group(...args) {
      // TODO: firefox does not support formatting in groupStart methods..
      consoleSupportsGroups ?
        console.groupCollapsed.apply(console, args) :
        console.log.apply(console, args);
      currentlyLoggedDepth++;
  }

  function groupEnd(time?) {
      currentlyLoggedDepth--;
      if (typeof time === 'number') {
          log('%ctotal time: %sms', 'color:gray', time);
      }
      if (consoleSupportsGroups)
          console.groupEnd();
  }

  function log(...args) {
      console.log.apply(console, args);
  }

  function dir(...args) {
      console.dir.apply(console, args);
  }

  function trace() {
      // TODO: needs wrapping in firefox?
    if (console.trace) {
      console.trace('stack'); // TODO: use stacktrace.js or similar and strip off unrelevant stuff?
    }
  }

  function closeGroupsOnError() {
      for (let i = 0, m = currentlyLoggedDepth; i < m; i++)
          groupEnd();
  }

  const closeToken = {
      '"' : '"',
      '\'' : '\'',
      '(' : ')',
      '[' : ']',
      '<' : ']',
      '#' : ''
  };

  function autoWrap(token, value) {
      if (!value)
          return '';
      return (token || '') + value + (closeToken[token] || '');
  }

  function observableName(object) {
      return getDebugName(object);
  }

  function formatValue(value) {
      if (isPrimitive(value)) {
          if (typeof value === 'string' && value.length > 100)
              return value.substr(0, 97) + '...';
          return value;
      } else
          return autoWrap('(', getNameForThis(value));
  }

  function getNameForThis(who) {
      if (who === null || who === undefined) {
          return '';
      } else if (who && typeof who === 'object') {
        if (who && who.$mobx) {
          return who.$mobx.name;
          } else if (who.constructor) {
              return who.constructor.name || 'object';
          }
    }
    return `${typeof who}`;
  }

  function isPrimitive(value) {
    return value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  return mobxAngularDebug;
})();

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as mobx from 'mobx';

function makeEntry(mod, version) {
  return {
    [version]: {
      get: () => Promise.resolve(() => mod),
      loaded: true,
      from: 'host',
      version,
    }
  };
}

export const sharedScope = {
  react: makeEntry(React, '19.2.0'),
  'react-dom': makeEntry(ReactDOM, '19.2.0'),
  mobx: makeEntry(mobx, '6.15.0'),
};

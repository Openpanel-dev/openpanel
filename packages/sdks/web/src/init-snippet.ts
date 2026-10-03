// Source:
// window.op = window.op || (function() {
//   var q = [];
//   var op = new Proxy(function() {
//     if (arguments.length > 0) {
//       q.push(Array.prototype.slice.call(arguments));
//     }
//   }, {
//     get: function(target, prop, receiver) {
//       if (prop === 'q') {
//         return q;
//       }
//       if (prop in target) {
//         return Reflect.get(target, prop, receiver);
//       }
//       return function() {
//         q.push([prop].concat(Array.prototype.slice.call(arguments)));
//       };
//     }
//   });
//   return op;
// })();

export function getInitSnippet(): string {
  return `window.op=window.op||function(){var n=[];return new Proxy(function(){arguments.length&&n.push([].slice.call(arguments))},{get:function(t,r,e){return"q"===r?n:r in t?Reflect.get(t,r,e):function(){n.push([r].concat([].slice.call(arguments)))}} ,has:function(t,r){return"q"===r}}) }();`;
}

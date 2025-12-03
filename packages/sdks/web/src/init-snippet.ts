// Source:
// window.op = window.op || (function() {
//   var q = [];
//   var op = new Proxy(function() {
//     if (arguments.length > 0) {
//       q.push(Array.prototype.slice.call(arguments));
//     }
//   }, {
//     get: function(_, prop) {
//       if (prop === 'q') {
//         return q;
//       }
//       return function() {
//         q.push([prop].concat(Array.prototype.slice.call(arguments)));
//       };
//     }
//   });
//   return op;
// })();

export function getInitSnippet(): string {
  return `window.op=window.op||function(){var n=[];return new Proxy(function(){arguments.length&&n.push([].slice.call(arguments))},{get:function(t,r){return"q"===r?n:function(){n.push([r].concat([].slice.call(arguments)))}} ,has:function(t,r){return"q"===r}}) }();`;
}

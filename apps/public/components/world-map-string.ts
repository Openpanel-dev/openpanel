const getMapJSON = require('dotted-map').getMapJSON;

// This function accepts the same arguments as DottedMap in the example above.
export const mapJsonString = getMapJSON({
  height: 90,
  grid: 'vertical',
  avoidOuterPins: true,
});

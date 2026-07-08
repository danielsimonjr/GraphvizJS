export const DOT_COLORS = [
  'black',
  'white',
  'gray',
  'grey',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'brown',
  'cyan',
  'magenta',
  'lightgray',
  'lightgrey',
  'lightblue',
  'darkgreen',
  'navy',
  'gold',
  'silver',
  'transparent',
] as const;

const COLOR_ATTRIBUTES = new Set(['color', 'bgcolor', 'fillcolor', 'fontcolor', 'pencolor']);

export function isColorAttribute(attr: string): boolean {
  return COLOR_ATTRIBUTES.has(attr.toLowerCase());
}

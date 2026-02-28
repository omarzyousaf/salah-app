// Islamic-themed color palette

export const Palette = {
  gold:       '#C8A96E',
  goldLight:  '#D4B87A',
  goldDim:    'rgba(200,169,110,0.30)',
  green:      '#1B4332',
  greenLight: '#2D6A4F',
  cream:      '#FAF7F2',
  // Semantic — same in both themes
  flame:      '#FF6B35',   // streak fire icon
  north:      '#EF5350',   // compass N indicator
  onGold:     '#1C1A17',   // text/icons placed on gold backgrounds
} as const;

export const Dark = {
  bg:           '#080808',
  card:         '#0F0F0F',
  cardAlt:      '#141414',
  text:         '#ECE6DB',
  textMuted:    '#8C8478',
  border:       'rgba(255,255,255,0.07)',
  tabBar:       '#0A0A0A',
  tabInactive:  '#4A4540',
  // Status
  danger:       '#E07070',
  dangerBg:     'rgba(220,80,80,0.12)',
  dangerBorder: 'rgba(220,80,80,0.28)',
};

export const Light = {
  bg:           '#FAF7F2',
  card:         '#FFFFFF',
  cardAlt:      '#F5F1EB',
  text:         '#1C1A17',
  textMuted:    '#8A7F72',
  border:       'rgba(0,0,0,0.08)',
  tabBar:       '#FFFFFF',
  tabInactive:  '#B0A898',
  // Status
  danger:       '#C94040',
  dangerBg:     'rgba(201,64,64,0.08)',
  dangerBorder: 'rgba(201,64,64,0.22)',
};

export type ThemeColors = typeof Dark;

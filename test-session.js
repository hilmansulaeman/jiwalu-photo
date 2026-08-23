const defaultSettings = { sessionTimer: 5 };
let stored = '{"sessionTimer": "2"}';
const settings = { ...defaultSettings, ...JSON.parse(stored) };
const minutes = parseFloat(settings.sessionTimer) || 5;
console.log(Math.floor(minutes * 60 * 1000));

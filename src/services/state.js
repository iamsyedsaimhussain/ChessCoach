// One shared object that all pages read from.
export const S = {
  user: '',
  profile: null,
  stats: null,
  games: [],
  loading: false,
  error: '',
  filter: 'all',
  current: null, // game being reviewed
  startPly: null,
  token: 0, // changes on every page change; running work checks it to stop
  cleanup: null,
};

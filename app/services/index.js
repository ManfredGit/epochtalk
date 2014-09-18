angular.module('ept')
  .factory('Auth', require('./auth'))
  .factory('AuthInterceptor', require('./authInterceptor.js'))
  .factory('ViewInterceptor', require('./viewInterceptor.js'))
  .factory('User', require('./user'));

var Boom = require('boom');
var path = require('path');
var Promise = require('bluebird');
var redis = require(path.normalize(__dirname + '/../../../redis'));

/**
 * JWT
 * decodedToken, the decrypted value in the token
 *   -- { username, user_id, email }
 * cb(err, isValid, credentials),
 *   -- isValid, if true if decodedToken matches a user token
 *   -- credentials, the user short object to be tied to request.auth.credentials
 */
module.exports = function(decodedToken, token, cb) {
  var userInfo, userRoles, userModerating;
  var userId = decodedToken.userId;
  var sessionId = decodedToken.sessionId;

  // get session information
  var sessionKey = 'user:' + userId + ':session:' + sessionId;
  return redis.getAsync(sessionKey)
  // validate session
  .then(function(timestamp) {
    if (!timestamp) { return Promise.reject(); }
    timestamp = Number(timestamp);
    if (timestamp !== decodedToken.timestamp) { return Promise.reject(); }
  })
  // get user information
  .then(function() {
    var userKey = 'user:' + userId;
    return redis.hgetallAsync(userKey)
    .then(function(value) { userInfo = value; });
  })
  // get user roles
  .then(function() {
    var userRoleKey = 'user:' + userId + ':roles';
    return redis.smembersAsync(userRoleKey)
    .then(function(value) { userRoles = value; });
  })
  // get user moderating boards
  .then(function() {
    var userModeratingKey = 'user:' + userId + ':moderating';
    return redis.smembersAsync(userModeratingKey)
    .then(function(value) { userModerating = value; });
  })
  .then(function() {
    // build credentials
    var credentials = {
      token: token,
      id: userId,
      sessionId: sessionId,
      username: userInfo.username,
      avatar: userInfo.avatar,
      roles: userRoles,
      moderating: userModerating
    };
    return cb(null, true, credentials);
  })
  .catch(function(err) {
    var error = Boom.unauthorized('Session is no longer valid.');
    return cb(error, false, {});
  });
};

var path = require('path');
var uuid = require('node-uuid');
var Promise = require('bluebird');
var db = require(path.normalize(__dirname + '/../../../db'));
var memDb = require(path.normalize(__dirname + '/../../memstore')).db;
var commonPre = require(path.normalize(__dirname + '/../common')).auth;
var Boom = require('boom');

module.exports = {
  canFind: function(request, reply) {
    var username = '';
    var threadId = request.params.id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isVisible = isThreadBoardVisible(threadId);

    var promise = Promise.join(isAdmin, isMod, isVisible, function(admin, mod, visible) {
      var result = Boom.notFound('Board Not Found');

      if (admin || mod) { result = ''; }
      else if (visible) { result = ''; }

      return result;
    });
    return reply(promise);

  },
  canRetrieve: function(request, reply) {
    var username = '';
    var boardId = request.query.board_id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isVisible = isBoardVisible(boardId);

    var promise = Promise.join(isAdmin, isMod, isVisible, function(admin, mod, visible) {
      var result = Boom.notFound('Board Not Found');

      if (admin || mod) { result = ''; }
      else if (visible) { result = ''; }

      return result;
    });
    return reply(promise);
  },
  canCreate: function(request, reply) {
    var username = '';
    var boardId = request.payload.board_id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isVisible = isBoardVisible(boardId);

    var promise = Promise.join(isAdmin, isMod, isVisible, function(admin, mod, visible) {
      var result = Boom.forbidden();

      if (admin || mod) { result = ''; }
      else if (visible) { result = ''; }
      return result;
    });
    return reply(promise);
  },
  canLock: function(request, reply) {
    var username = '';
    var threadId = request.params.id;
    var userId = request.auth.credentials.id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isVisible = isThreadBoardVisible(threadId);
    var isOwner = isThreadOwner(threadId, userId);

    var promise = Promise.join(isAdmin, isMod, isVisible, isOwner, function(admin, mod, visible, owner) {
      var result = Boom.forbidden();

      if (admin || mod) { result = ''; }
      else if (owner && visible) { result = ''; }

      return result;
    });
    return reply(promise);
  },
  canMove: managementAccess,
  canSticky: managementAccess,
  canDelete: managementAccess,
  canPurge: managementAccess,
  getThreads: function(request, reply) {
    var boardId = request.query.board_id;
    var opts = {
      limit: request.query.limit,
      page: request.query.page
    };

    db.threads.byBoard(boardId, opts)
    .then(function(threads) { return reply(threads); })
    .catch(function(err) { return reply(err.message); });
  },
  getThread: function(request, reply) {
    var threadId = request.params.id || request.query.id;
    db.threads.find(threadId)
    .then(function(thread) { return reply(thread); })
    .catch(function(err) { return reply(err); });
  },
  checkViewValidity: function(request, reply) {
    var threadId = request.params.id || request.query.id;
    var viewerId = request.headers['epoch-viewer'];
    var viewerAddress = request.info.remoteAddress;
    var newViewerId;

    if (viewerId) { // viewerId was sent back so try that
      var viewerIdKey = viewerId + threadId;
      return checkViewKey(viewerIdKey)
      .then(function(valid) { // viewId found
        if (valid) { db.threads.incViewCount(threadId); }
        return reply(undefined);
      })
      .catch(function() { // viewId not found
        memDb.putAsync(viewerIdKey, Date.now()); // save to memdb
        var addressKey = viewerAddress + threadId;
        return checkViewKey(addressKey)
        .then(function(valid) { // address found
          if (valid) { db.threads.incViewCount(threadId); }
          return reply(undefined);
        })
        // address doesn't exists so inc is valid
        .catch(function() {
          memDb.putAsync(addressKey, Date.now());
          db.threads.incViewCount(threadId);
          return reply(undefined);
        });
      });
    } // no viewerId, check IP
    else {
      newViewerId = uuid.v4(); // generate new viewerId
      memDb.putAsync(newViewerId + threadId, Date.now()); // save to mem db
      var addressKey = viewerAddress + threadId;
      return checkViewKey(addressKey)
      .then(function(valid) {
        if (valid) { db.threads.incViewCount(threadId); }
        return reply(newViewerId);
      })
      // address doesn't exists so inc is valid
      .catch(function() {
        memDb.putAsync(addressKey, Date.now());
        db.threads.incViewCount(threadId);
        return reply(newViewerId);
      });
    }
  },
  getUserThreadViews: function(request, reply) {
    // return early if not signed in
    if (!request.auth.isAuthenticated) { return reply(undefined); }

    var user = request.auth.credentials;
    db.users.getUserThreadViews(user.id)
    .then(function(userViews) { return reply(userViews); })
    .catch(function() { return reply({}); });
  },
  updateUserThreadViews: function(request, reply) {
    // return early if not signed in
    if (!request.auth.isAuthenticated) { return reply(); }

    var threadId = request.params.id || request.query.id;
    var now = Date.now();
    var user = request.auth.credentials;
    var newThreadViews = [ { threadId: threadId, timestamp: now } ];
    db.users.putUserThreadViews(user.id, newThreadViews)
    .then(function() { return reply(); })
    .catch(function(err) { return reply(err); });
  }
};

// Re-Used permissions
function managementAccess(request, reply) {
  var username = '';
  var threadId = request.params.id;
  var authenticated = request.auth.isAuthenticated;
  if (authenticated) { username = request.auth.credentials.username; }

  var isAdmin = commonPre.isAdmin(authenticated, username);
  var isMod = commonPre.isMod(authenticated, username);

  var promise = Promise.join(isAdmin, isMod, function(admin, mod) {
    var result = Boom.forbidden();
    if (admin ||  mod) { result = ''; }
    return result;
  });
  return reply(promise);
}

// Helpers
function isBoardVisible(boardId) {
  return db.boards.getBoardInBoardMapping(boardId)
  .then(function(board) {
    var visible = false;
    if (board) { visible = true; }
    return visible;
  });
}

function isThreadBoardVisible(threadId) {
  return db.threads.getThreadsBoardInBoardMapping(threadId)
  .then(function(board) {
    var visible = false;
    if (board) { visible = true; }
    return visible;
  });
}

function isThreadOwner(threadId, userId) {
  return db.threads.getThreadOwner(threadId)
  .then(function(owner) { return owner.user_id === userId; });
}

function checkViewKey(key) {
  return memDb.getAsync(key)
  .then(function(storedTime) {
    var timeElapsed = Date.now() - storedTime;
    // key exists and is past the cooling period
    // update key with new value and return true
    if (timeElapsed > 1000 * 60) {
      return memDb.putAsync(key, Date.now())
      .then(function() { return true; });
    }
    // key exists but before cooling period
    // do nothing and return false
    else { return false; }
  });
}

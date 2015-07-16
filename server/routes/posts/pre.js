var path = require('path');
var Boom = require('boom');
var cheerio = require('cheerio');
var Promise = require('bluebird');
var bbcodeParser = require('epochtalk-bbcode-parser');
var db = require(path.normalize(__dirname + '/../../../db'));
var config = require(path.normalize(__dirname + '/../../../config'));
var imageStore = require(path.normalize(__dirname + '/../../images'));
var sanitizer = require(path.normalize(__dirname + '/../../sanitizer'));
var commonPre = require(path.normalize(__dirname + '/../common')).auth;

module.exports = {
  canFind: function(request, reply) {
    var username = '';
    var postId = request.params.id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isThreadDeleted = isPostThreadDeleted(postId);
    var isBoardVisible = isPostBoardVisible(postId);

    var promise = Promise.join(isAdmin, isMod, isThreadDeleted, isBoardVisible, function(admin, mod, threadDeleted, visible) {
      var result = Boom.notFound();
      if (admin || mod) { result = ''; }
      else if (!threadDeleted && visible) { result = ''; }
      return result;
    });
    return reply(promise);
  },
  canRetrieve: function(request, reply) {
    var username = '';
    var threadId = request.query.thread_id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isDeleted = isThreadDeleted(threadId);
    var isBoardVisible = isThreadBoardVisible(threadId);

    var promise = Promise.join(isAdmin, isMod, isDeleted, isBoardVisible, function(admin, mod, threadDeleted, visible) {
      var result = Boom.notFound();

      if (admin || mod) { result = ''; }
      else if (!threadDeleted && visible) { result = ''; }

      return result;
    });
    return reply(promise);
  },
  canCreate: function(request, reply) {
    var username = '';
    var threadId = request.payload.thread_id;
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isLocked = isThreadLocked(threadId);
    var isDeleted = isThreadDeleted(threadId);
    var isBoardVisible = isThreadBoardVisible(threadId);

    var promise = Promise.join(isAdmin, isMod, isLocked, isDeleted, isBoardVisible, function(admin, mod, locked, deleted, visible) {
      var result = Boom.forbidden();

      if (admin || mod) { result = ''; }
      else if (deleted) { result = Boom.notFound(); }
      else if (locked) { result = Boom.forbidden; }
      else if (visible) { result = ''; }

      return result;
    });
    return reply(promise);
  },
  canUpdate: function(request, reply) {
    var postId = request.params.id;
    var userId = '';
    var username = '';
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }
    if (authenticated) { userId = request.auth.credentials.id; }

    var isLocked = isPostThreadLocked(postId);
    var isOwner = isPostOwner(userId, postId);
    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isMod = commonPre.isMod(authenticated, username);
    var isDeleted = isPostDeleted(postId);
    var isThreadDeleted = isPostThreadDeleted(postId);
    var isBoardVisible = isPostBoardVisible(postId);

    var promise = Promise.join(isAdmin, isMod, isLocked, isOwner, isDeleted, isThreadDeleted, isBoardVisible, function(admin, mod, locked, owner, deleted, threadDeleted, visible) {
      var result = Boom.forbidden();

      if (admin || mod) { result = ''; }
      else if (deleted) { result = Boom.notFound(); }
      else if (threadDeleted) { result = Boom.notFound(); }
      else if (!visible) { result = Boom.notFound(); }
      else if (locked) { result = Boom.forbidden(); }
      else if (owner) { result = ''; }
      return result;
    });
    return reply(promise);
  },
  canDelete: function(request, reply) {
    var postId = request.params.id;
    var userId = '';
    var username = '';
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }
    if (authenticated) { userId = request.auth.credentials.id; }

    var isLocked = isPostThreadLocked(postId);
    var isOwner = isPostOwner(userId, postId);
    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isFirst = isFirstPost(postId);
    var isThreadDeleted = isPostThreadDeleted(postId);
    var isBoardVisible = isPostBoardVisible(postId);

    var promise = Promise.join(isAdmin, isLocked, isOwner, isFirst, isThreadDeleted, isBoardVisible, function(admin, locked, owner, firstPost, threadDeleted, visible) {
      var result = Boom.forbidden();
      if (firstPost) { result = Boom.forbidden(); }
      else if (admin) { result = ''; }
      else if (threadDeleted) { result = Boom.notFound(); }
      else if (!visible) { result = Boom.notFound(); }
      else if (locked) { result = Boom.forbidden(); }
      else if (owner) { result = ''; }
      return result;
    });
    return reply(promise);
  },
  canPurge: function(request, reply) {
    var postId = request.params.id;
    var username = '';
    var authenticated = request.auth.isAuthenticated;
    if (authenticated) { username = request.auth.credentials.username; }

    var isAdmin = commonPre.isAdmin(authenticated, username);
    var isFirst = isFirstPost(postId);

    var promise = Promise.join(isAdmin, isFirst, function(admin, firstPost) {
      var result = Boom.forbidden();
      if (firstPost) { result = Boom.forbidden(); }
      else if (admin) { result = ''; }
      return result;
    });
    return reply(promise);
  },
  clean: function(request, reply) {
    request.payload.title = sanitizer.strip(request.payload.title);
    request.payload.raw_body = sanitizer.bbcode(request.payload.raw_body);
    return reply();
  },
  adjustQuoteDate: function(request, reply) {
    var input = request.payload.raw_body;
    var reg = /\[quote.*?(date=[0-9]*).*?\]/gi;
    var matchArray;
    var replaceArray = [];

    while ((matchArray = reg.exec(input)) !== null) {
      replaceArray.push(matchArray[1]);
    }

    replaceArray.forEach(function(oldDate) {
      var date = Number(oldDate.replace('date=', ''));
      var newDate = 'date=' + date * 1000;
      request.payload.raw_body = request.payload.raw_body.replace(oldDate, newDate);
    });

    return reply();
  },
  parseEncodings: function(request, reply) {
    var raw_body = request.payload.raw_body;
    // check if raw_body has any bbcode
    if (raw_body.indexOf('[') >= 0) {
      // convert all (<, &lt;) and (>, &gt;) to decimal to escape the regex
      // in the bbcode parser that'll unescape those chars
      raw_body = raw_body.replace(/(?:<|&lt;)/g, '&#60;');
      raw_body = raw_body.replace(/(?:>|&gt;)/g, '&#62;');

      // convert all unicode characters to their numeric representation
      // this is so we can save it to the db and present it to any encoding
      raw_body = textToEntities(raw_body);

      // parse raw_body to generate body
      var parsedBody = bbcodeParser.process({text: raw_body}).html;
      request.payload.body = parsedBody;

      // check if parsing was needed
        // it wasn't need so remove raw_body
      if (parsedBody === raw_body) { request.payload.raw_body = null; }
    }
    else {
      // nothing to parse, just move raw_body to body
      request.payload.body = request.payload.raw_body;
      request.payload.raw_body = null;
    }

    return reply();
  },
  subImages: function(request, reply) {
    // load html in post.body into cheerio
    var html = request.payload.body;
    var $ = cheerio.load(html);

    // collect all the images in the body
    var images = [];
    $('img').each(function(index, element) {
      images.push(element);
    });

    // convert each image's src to cdn version
    return Promise.map(images, function(element) {
      var imgSrc = $(element).attr('src');
      var storage = config.images.storage;
      var savedUrl = imageStore[storage].saveImage(imgSrc);

      if (savedUrl) {
        // move original src to data-canonical-src
        $(element).attr('data-canonical-src', imgSrc);
        // update src with new url
        $(element).attr('src', savedUrl);
      }
    })
    .then(function() {
      request.payload.body = $.html();
      return reply();
    })
    .catch(function(err) { return reply(err); });
  }
};

function textToEntities(text) {
  var entities = "";
  for (var i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      entities += "&#" + text.charCodeAt(i) + ";";
    }
    else { entities += text.charAt(i); }
  }

  return entities;
}

function isThreadDeleted(threadId) {
  return db.threads.deepFind(threadId)
  .then(function(thread) { return thread.deleted; });
}

function isThreadBoardVisible(threadId) {
  return db.threads.getThreadsBoardInBoardMapping(threadId)
  .then(function(board) {
    var visible = false;
    if (board) { visible = true; }
    return visible;
  });
}

function isThreadLocked(threadId) {
  return db.threads.find(threadId)
  .then(function(thread) { return thread.locked; });
}

function isPostThreadLocked(postId) {
  return db.posts.getPostsThread(postId)
  .then(function(thread) { return thread.locked; });
}

function isPostThreadDeleted(postId) {
  return db.posts.getPostsThread(postId)
  .then(function(thread) { return thread.deleted; });
}

function isPostBoardVisible(postId) {
  return db.posts.getPostsBoardInBoardMapping(postId)
  .then(function(board) {
    var visible = false;
    if (board) { visible = true; }
    return visible;
  });
}

function isPostOwner(userId, postId) {
  return db.posts.deepFind(postId)
  .then(function(post) { return post.user_id === userId; });
}

function isFirstPost(postId) {
  return db.posts.getThreadFirstPost(postId)
  .then(function(post) { return post.id === postId; });
}

function isPostDeleted(postId) {
  return db.posts.find(postId)
  .then(function(post) { return post.deleted; });
}

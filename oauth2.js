'use strict';

var _ = require('lodash');
var crypto = require('crypto');
var oauth2orize = require('oauth2orize');
var passport = require('passport');
var moment = require('moment');
var async = require('async');

var config = require('./config');
var utils = require('./utils');

var db = require('./db');
var hp = require('./ws/hp');
var osb = require('./ws/osb');
var qms = require('./ws/qms');

var oauthLog = config.logger.oauthLog.child({ TAG : 'OAUTH2_OPERATION'});

// create OAuth 2.0 server
var server = oauth2orize.createServer();

server.exchange(oauth2orize.exchange.password(function (client, username, password, scope, done) {
  var req = {
    id: 'GGO' + ((moment().format('YYYYMMDDHHmmssSSS')) + _.padLeft(Math.floor(Math.random() * 1000), 3, '0')),
    user: {
      token: undefined,
      tokenId: undefined,
      dealerCode: undefined,
      isVault: client.isVault
    }
  }

  hp.users.authenticateUser(req, username, password, function (err, user) {
    if (err) {
      oauthLog.error(_.assign({}, {username: username, error: err}), 'Error during authenticateUser')
      return done(new oauth2orize.TokenError(err, 'invalid_grant'));
    }
    if(typeof user === 'string'){
      oauthLog.error(_.assign({}, {username: username, error: user}), 'Authentication Fail')
      if(user === 'Username does not exist') {
        return done(new oauth2orize.TokenError('Invalid username/password combination. Kindly retry with valid credentials.', 'invalid_grant'));
      }else if(user === 'Your username is deactivated') {
        return done(new oauth2orize.TokenError('Your account has been inactive for more than 60 days. Please call Partner Support at 016 299 8899 for further assistance.', 'invalid_grant'));
      } else {
        return done(new oauth2orize.TokenError(user, 'invalid_grant'));
      }
    }
    if (!user) {
      oauthLog.error(_.assign({}, {username: username, error: 'Missing User Profile'}), 'Missing User Profile')
      return done(new oauth2orize.TokenError('Missing user profile', 'invalid_grant'));
    }
    var token = utils.uid(config.setting.token.accessTokenLength, username+req.id);
    db.accessTokens.save(token, config.setting.token.calculateExpirationDate(), user.id, client.id, user.roles, user.dealerCode, user.posFlag, user.dealerDemoMsisdn, user.pyramidLevel, user.region, user.dealerCategory, function (err, tokenId) {
      if (err) {
        oauthLog.error(_.assign({}, {username: username, error: err}), 'Error during acquire token')
        return done(new oauth2orize.TokenError('Request busy. Please try again', 'invalid_grant'));
      }else {
        db.accessTokens.check(user.id, function(err, dbResult) {
          if (err) {
            return done(new oauth2orize.TokenError('Request busy. Please try again', 'invalid_grant'));
          } else {
            if(dbResult == false) {
              oauthLog.info(_.assign({}, {username: username, token: token, expires_in: config.setting.token.expiresIn, scope: user.roles, multipleLogin: false, isFirstTimeUserLogin: user.isFirstTimeUserLogin}), 'Successfully issue a token');
              db.auditTrails.save(token, tokenId, req.id, undefined, user.id, user.dealerCode, ('MS' + pad(__instanceId || 0, 2)), 'DealerLogin', 'Successful', user.id, function (err){
                return done(null, token, {expires_in: config.setting.token.expiresIn, scope: user.roles, multipleLogin: false, isFirstTimeUserLogin: user.isFirstTimeUserLogin, pyramidLevel: user.pyramidLevel});
              })
            } else {
              oauthLog.info(_.assign({}, {username: username, token: token, expires_in: config.setting.token.expiresIn, scope: user.roles, multipleLogin: true, isFirstTimeUserLogin: user.isFirstTimeUserLogin}), 'Successfully issue a token');
              db.auditTrails.save(token, tokenId, req.id, undefined, user.id, user.dealerCode, ('MS' + pad(__instanceId || 0, 2)), 'DealerLogin', 'Successful', user.id, function (err){
                return done(null, token, {expires_in: config.setting.token.expiresIn, scope: user.roles, multipleLogin: true, isFirstTimeUserLogin: user.isFirstTimeUserLogin, pyramidLevel: user.pyramidLevel});
              })
            }
          }
        })
      }
    })
  });
}));

exports.token = [
  passport.authenticate(['basic'], {session: false}),
  server.token(),
  server.errorHandler()
];

exports.renew = [
  passport.authenticate('bearer', {session: false}),
  function (req, res) {
    osb.common.renewToken(req, res, function (err, token){
      if(err) {
        res.json(err)
      }else{
        res.json(token)
      }
    });
  }
];

exports.invalidate = [
  passport.authenticate('bearer', {session: false}),
  function (req, res) {
    async.parallel({
      invalidate: function(callback){
        osb.common.invalidateToken(req, res, function (err, token){
          if(err) {
            callback(err)
          }else{
            callback(null, token)
          }
        });
      },
      counter: function(callback){
        if((_.indexOf(req.authInfo.scope, 'FUNCTIONAL_VC') > -1)) {
          qms.counter.closeCounter(req, res, req.user, function(err, result){
            callback(null, result);
          });
        } else {
          callback(null);
        }
      }
    }, function(err, result){
      if(err) {
        res.json(err)
      }else{
        var output = result.invalidate;
        if(result.counter) { output.concierge = result.counter };
        res.json(output)
      }
    });
  }
];

server.serializeClient(function (client, done) {
  return done(null, client.id);
});

server.deserializeClient(function (id, done) {
  db.clients.find(id, function (err, client) {
    if (err) {
      return done(err);
    }
    return done(null, client);
  });
});

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

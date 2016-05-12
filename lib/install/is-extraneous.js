'use strict'
var path = require('path')
var npm = require('../npm.js')

module.exports = function (tree) {
  var isTopLevel = tree.isTop
  var isChildOfTop = !isTopLevel && tree.parent.parent == null
  var isTopGlobal = isChildOfTop && tree.parent.path === path.resolve(npm.globalDir, '..')
  var topHasNoPackageJson = isChildOfTop && tree.parent.error
  return !isTopLevel && (!isChildOfTop || !topHasNoPackageJson) && !isTopGlobal && tree.requiredBy.length === 0
}

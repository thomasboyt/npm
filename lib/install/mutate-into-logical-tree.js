'use strict'
var union = require('lodash.union')
var without = require('lodash.without')
var validate = require('aproba')
var flattenTree = require('./flatten-tree.js')
var isExtraneous = require('./is-extraneous.js')
var validateAllPeerDeps = require('./deps.js').validateAllPeerDeps
var packageId = require('../utils/package-id.js')
var moduleName = require('../utils/module-name.js')

var mutateIntoLogicalTree = module.exports = function (tree) {
  validate('O', arguments)

  validateAllPeerDeps(tree, function (tree, pkgname, version) {
    if (!tree.missingPeers) tree.missingPeers = {}
    tree.missingPeers[pkgname] = version
  })

  var flat = flattenTree(tree)

  Object.keys(flat).sort().forEach(function (flatname) {
    var node = flat[flatname]
    if (!node.requiredBy.length) return

    if (node.parent) {
      // If the module is extraneous that means its unreachable from the
      // root's requiredBy, so if that's the case we don't want to
      // detach the node from from the tree.
      if (isExtraneous(node)) {
        // we flag it as the top of its own little subtree, so that
        // deps of it don't also get attached to the top of the tree
        node.isTop = true
      } else {
        node.parent.children = without(node.parent.children, node)
      }
    }

    node.requiredBy.forEach(function (parentNode) {
      parentNode.children = union(parentNode.children, [node])
    })
  })
  return tree
}

module.exports.asReadInstalled = function (tree) {
  mutateIntoLogicalTree(tree)
  return translateTree(tree)
}

function translateTree (tree) {
  return translateTree_(tree, {})
}

function translateTree_ (tree, seen) {
  var pkg = tree.package
  if (seen[tree.path]) return pkg
  seen[tree.path] = pkg
  if (pkg._dependencies) return pkg
  pkg._dependencies = pkg.dependencies
  pkg.dependencies = {}
  tree.children.forEach(function (child) {
    pkg.dependencies[moduleName(child)] = translateTree_(child, seen)
  })

  function markMissing (name, requiredBy) {
    if (pkg.dependencies[name]) {
      if (pkg.dependencies[name].missing) return
      pkg.dependencies[name].invalid = true
      pkg.dependencies[name].realName = name
      pkg.dependencies[name].extraneous = false
    } else {
      pkg.dependencies[name] = {
        requiredBy: requiredBy,
        missing: true,
        optional: !!pkg.optionalDependencies[name]
      }
    }
  }

  Object.keys(tree.missingDeps).forEach(function (name) {
    markMissing(name, tree.missingDeps[name])
  })
  Object.keys(tree.missingDevDeps).forEach(function (name) {
    markMissing(name, tree.missingDevDeps[name])
  })
  var checkForMissingPeers = (tree.parent ? [] : [tree]).concat(tree.children)
  checkForMissingPeers.filter(function (child) {
    return child.missingPeers
  }).forEach(function (child) {
    Object.keys(child.missingPeers).forEach(function (pkgname) {
      var version = child.missingPeers[pkgname]
      var peerPkg = pkg.dependencies[pkgname]
      if (!peerPkg) {
        peerPkg = pkg.dependencies[pkgname] = {
          _id: pkgname + '@' + version,
          name: pkgname,
          version: version
        }
      }
      if (!peerPkg.peerMissing) peerPkg.peerMissing = []
      peerPkg.peerMissing.push({
        requiredBy: packageId(child),
        requires: pkgname + '@' + version
      })
    })
  })
  pkg.path = tree.path

  pkg.error = tree.error
  pkg.extraneous = isExtraneous(tree)
  if (tree.target && tree.parent && !tree.parent.target) pkg.link = tree.realpath
  return pkg
}

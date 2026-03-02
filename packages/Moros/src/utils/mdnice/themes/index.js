// Local copy of Markdown-Nice theme CSS strings
// We import the CSS string templates so we can delete the original markdown-nice folder later.

import basic from './basic'

import blue from './markdown/blue'
import blueCyan from './markdown/blueCyan'
import blueMountain from './markdown/blueMountain'
import custom from './markdown/custom'
import cuteGreen from './markdown/cuteGreen'
import cyan from './markdown/cyan'
import extremeBlack from './markdown/extremeBlack'
import fullStackBlue from './markdown/fullStackBlue'
import geekBlack from './markdown/geekBlack'
import green from './markdown/green'
import ink from './markdown/ink'
import nightPurple from './markdown/nightPurple'
import normal from './markdown/normal'
import orangeHeart from './markdown/orangeHeart'
import purple from './markdown/purple'
import red from './markdown/red'
import rose from './markdown/rose'
import scienceBlue from './markdown/scienceBlue'
import shanchui from './markdown/shanchui'
import simple from './markdown/simple'
import wechatFormat from './markdown/wechatFormat'

export const basicCss = basic

export const markdownThemes = {
  normal,
  shanchui,
  rose,
  fullStackBlue,
  nightPurple,
  cuteGreen,
  extremeBlack,
  orangeHeart,
  ink,
  purple,
  green,
  cyan,
  wechatFormat,
  blueCyan,
  blueMountain,
  geekBlack,
  red,
  blue,
  scienceBlue,
  simple,
  custom,
}

export const markdownThemeOptions = Object.keys(markdownThemes).map((id) => ({ id, name: id }))

// Code themes (highlight.js) and Mac variants
import atomOneDark from './code/atomOneDark'
import atomOneLight from './code/atomOneLight'
import monokai from './code/monokai'
import github from './code/github'
import vs2015 from './code/vs2015'
import xcode from './code/xcode'

import macAtomOneDark from './macCode/macAtomOneDark'
import macAtomOneLight from './macCode/macAtomOneLight'
import macMonokai from './macCode/macMonokai'
import macGithub from './macCode/macGithub'
import macVs2015 from './macCode/macVs2015'
import macXcode from './macCode/macXcode'

export const codeThemes = {
  atomOneDark,
  atomOneLight,
  monokai,
  github,
  vs2015,
  xcode,
}

export const macCodeThemes = {
  macAtomOneDark,
  macAtomOneLight,
  macMonokai,
  macGithub,
  macVs2015,
  macXcode,
}

export const codeThemeOptions = [
  { id: 'wechat', name: '微信代码主题' },
  { id: 'atomOneDark', name: 'atom-one-dark' },
  { id: 'atomOneLight', name: 'atom-one-light' },
  { id: 'monokai', name: 'monokai' },
  { id: 'github', name: 'github' },
  { id: 'vs2015', name: 'vs2015' },
  { id: 'xcode', name: 'xcode' },
]


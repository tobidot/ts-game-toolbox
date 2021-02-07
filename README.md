# Ts Game Toolbox

Disclaimer:
This is a privately managed package feel free to use it at own risk.
At times i will introduce major changes.

> {danger} This package is far from stable.

## Description
This is intended to be a personal toolbox for Games or Programs developed in Javascript/Typescript.
It contains a few reusable funcitons and classes, increasing over time.

## Recommendation
These tools will be mostly developed with a application in mind that will use React,
to handle the Menu and p5.js to display the gamestate.

## Namespaces
The tools are divided into the following namespaces.

### Assets
Tools to help with loading storing and retrieveng various types of assets.

### Geometry
Contains classes and functions handling Geometric calculations

The Geometric functions and classes assume a 2D-coordinate system,
where -x is left +x is at the right -y is at the bottom and +y at the top.
  
|..|-y|..|  
|-x|..|+x|  
|..|+y|..|

The angle of a vector will mostly be expected in radians (from 0 to +2Pi).
With angle 0 the vector is pointing to the right. 

### Trees
Several classes and implementations of tree-structure to store and access data.

### Signals
Helpers to connect distant parts of the programs with events and signals

### Abstract
Will hold abstract programming paradigm related classes, 
like the base classes for model view composer

### Test-Helpers
Tools for a custom test-suite

## Quick Version Log
- 4.0.0 
  - Major restructuring of the mvc part
- 3.0.0 
  - Cut the Dependencies to react and p5
- 2.0.0 
  - Introduce the abstract MVC-Components 
- 1.0.0 
  - Initial version
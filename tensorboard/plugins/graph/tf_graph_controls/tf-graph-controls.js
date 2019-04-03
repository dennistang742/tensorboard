/* Copyright 2019 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
var tf;
(function (tf) {
    var graph;
    (function (graph) {
        var controls;
        (function (controls) {
            var DEVICE_NAME_REGEX = /device:([^:]+:[0-9]+)$/;
            /**
             * Display only devices matching one of the following regex.
             */
            var DEVICE_NAMES_INCLUDE = [
                {
                    // Don't include GPU stream, memcpy, etc. devices
                    regex: DEVICE_NAME_REGEX,
                }
            ];
            /**
             * Stats from device names that match these regexes will be disabled by default.
             * The user can still turn on a device by selecting the checkbox in the device list.
             */
            var DEVICE_STATS_DEFAULT_OFF = [];
            var ColorBy;
            (function (ColorBy) {
                ColorBy["COMPUTE_TIME"] = "compute_time";
                ColorBy["MEMORY"] = "memory";
                ColorBy["STRUCTURE"] = "structure";
                ColorBy["XLA_CLUSTER"] = "xla_cluster";
                ColorBy["OP_COMPATIBILITY"] = "op_compatibility";
            })(ColorBy = controls.ColorBy || (controls.ColorBy = {}));
            var GRADIENT_COMPATIBLE_COLOR_BY = new Set([
                ColorBy.COMPUTE_TIME, ColorBy.MEMORY
            ]);
            Polymer({
                is: 'tf-graph-controls',
                properties: {
                    // Public API.
                    /**
                     * @type {?tf.graph.proto.StepStats}
                     */
                    stats: {
                        value: null,
                        type: Object,
                        observer: '_statsChanged',
                    },
                    /**
                     * @type {?Object<string, boolean>}
                     */
                    devicesForStats: {
                        value: null,
                        type: Object,
                        notify: true,
                        // TODO(stephanwlee): Change readonly -> readOnly and fix the setter.
                        readonly: true,
                    },
                    /**
                     * @type {!tf.graph.controls.ColorBy}
                     */
                    colorBy: {
                        type: String,
                        value: ColorBy.STRUCTURE,
                        notify: true,
                    },
                    colorByParams: {
                        type: Object,
                        notify: true,
                        // TODO(stephanwlee): Change readonly -> readOnly and fix the setter.
                        readonly: true,
                    },
                    datasets: {
                        type: Array,
                        observer: '_datasetsChanged',
                        value: function () { return []; },
                    },
                    /**
                     * @type {tf.graph.render.RenderGraphInfo}
                     */
                    renderHierarchy: {
                        type: Object,
                        notify: true,
                    },
                    /**
                     * @type {!Selection}
                     */
                    selection: {
                        type: Object,
                        notify: true,
                        readOnly: true,
                        computed: '_computeSelection(datasets, _selectedRunIndex, _selectedTagIndex, _selectedGraphType)',
                    },
                    selectedFile: {
                        type: Object,
                        notify: true,
                    },
                    _selectedRunIndex: {
                        type: Number,
                        value: 0,
                        observer: '_selectedRunIndexChanged',
                    },
                    _selectedTagIndex: {
                        type: Number,
                        value: 0,
                        observer: '_selectedTagIndexChanged',
                    },
                    /**
                     * @type {tf.graph.SelectionType}
                     */
                    _selectedGraphType: {
                        type: String,
                        value: tf.graph.SelectionType.OP_GRAPH,
                    },
                    selectedNode: {
                        type: String,
                        notify: true,
                    },
                    _currentDevices: {
                        type: Array,
                        computed: '_getCurrentDevices(devicesForStats)',
                    },
                    _currentDeviceParams: {
                        type: Array,
                        computed: '_getCurrentDeviceParams(colorByParams)',
                    },
                    _currentXlaClusterParams: {
                        type: Array,
                        computed: '_getCurrentXlaClusterParams(colorByParams)',
                    },
                    _currentGradientParams: {
                        type: Object,
                        computed: '_getCurrentGradientParams(colorByParams, colorBy)',
                    },
                    showSessionRunsDropdown: {
                        type: Boolean,
                        value: true,
                    },
                    showUploadButton: {
                        type: Boolean,
                        value: true,
                    },
                    // This stores whether the feature for showing health pills is enabled in the first place.
                    healthPillsFeatureEnabled: Boolean,
                    // This stores whether to show health pills. Only relevant if healthPillsFeatureEnabled. The
                    // user can toggle this value.
                    healthPillsToggledOn: {
                        type: Boolean,
                        notify: true,
                    },
                    _legendOpened: {
                        type: Boolean,
                        value: true,
                    },
                },
                listeners: {
                    'trace-inputs.change': '_traceInputToggleChanged',
                },
                _traceInputToggleChanged: function (event) {
                    // Flip the state of the trace inputs flag.
                    var toggleButton = event.target;
                    this.renderHierarchy.traceInputs = toggleButton.active;
                    tf.graph.scene.node.traceInputs(this.renderHierarchy);
                },
                _xlaClustersProvided: function (renderHierarchy) {
                    return renderHierarchy &&
                        renderHierarchy.hierarchy &&
                        renderHierarchy.hierarchy.xlaClusters.length > 0;
                },
                _statsChanged: function (stats) {
                    if (stats == null) {
                        return;
                    }
                    var devicesForStats = {};
                    var devices = _.each(stats.dev_stats, function (d) {
                        // Only considered included devices.
                        var include = _.some(DEVICE_NAMES_INCLUDE, function (rule) {
                            return rule.regex.test(d.device);
                        });
                        // Exclude device names that are ignored by default.
                        var exclude = _.some(DEVICE_STATS_DEFAULT_OFF, function (rule) {
                            return rule.regex.test(d.device);
                        });
                        if (include && !exclude) {
                            devicesForStats[d.device] = true;
                        }
                    });
                    this.set('devicesForStats', devicesForStats);
                },
                _getCurrentDevices: function (devicesForStats) {
                    var stats = this.stats;
                    var devStats = stats ? stats.dev_stats : [];
                    var allDevices = devStats.map(function (d) { return d.device; });
                    var devices = allDevices.filter(function (deviceName) {
                        return DEVICE_NAMES_INCLUDE.some(function (rule) {
                            return rule.regex.test(deviceName);
                        });
                    });
                    // Devices names can be long so we remove the longest common prefix
                    // before showing the devices in a list.
                    var suffixes = tf.graph.util.removeCommonPrefix(devices);
                    if (suffixes.length == 1) {
                        var found = suffixes[0].match(DEVICE_NAME_REGEX);
                        if (found) {
                            suffixes[0] = found[1];
                        }
                    }
                    return devices.map(function (device, i) {
                        var ignoredMsg = null;
                        // TODO(stephanwlee): this should probably bail on the first match or
                        // do something useful with multiple rule.msgs.
                        DEVICE_STATS_DEFAULT_OFF.forEach(function (rule) {
                            if (rule.regex.test(device)) {
                                ignoredMsg = rule.msg;
                            }
                        });
                        return {
                            device: device,
                            suffix: suffixes[i],
                            used: devicesForStats[device],
                            ignoredMsg: ignoredMsg,
                        };
                    });
                },
                _deviceCheckboxClicked: function (event) {
                    // Update the device map.
                    var input = event.target;
                    var devicesForStats = Object.assign({}, this.devicesForStats);
                    var device = input.value;
                    if (input.checked) {
                        devicesForStats[device] = true;
                    }
                    else {
                        delete devicesForStats[device];
                    }
                    this.set('devicesForStats', devicesForStats);
                },
                _numTags: function (datasets, _selectedRunIndex) {
                    return this._getTags(datasets, _selectedRunIndex).length;
                },
                _getTags: function (datasets, _selectedRunIndex) {
                    if (!datasets || !datasets[_selectedRunIndex]) {
                        return [];
                    }
                    return datasets[_selectedRunIndex].tags;
                },
                fit: function () {
                    // TODO(stephanwlee): document -> this. A WebComponent should not use
                    // document.querySelector. tf-graph renders tf-graph-scene#scene
                    // which means this component has an incomplete API and encapsulation is
                    // leaking in a bad way.
                    // Constructor is not exported and is not typed.
                    var tfGraphScene = document.querySelector('#scene');
                    tfGraphScene.fit();
                },
                _isGradientColoring: function (stats, colorBy) {
                    return GRADIENT_COMPATIBLE_COLOR_BY.has(colorBy) && stats != null;
                },
                _equals: function (a, b) {
                    return a === b;
                },
                _getCurrentDeviceParams: function (colorByParams) {
                    var deviceParams = colorByParams.device.filter(function (param) {
                        return DEVICE_NAMES_INCLUDE.some(function (rule) {
                            return rule.regex.test(param.device);
                        });
                    });
                    // Remove common prefix and merge back corresponding color. If
                    // there is only one device then remove everything up to "/device:".
                    var suffixes = tf.graph.util.removeCommonPrefix(deviceParams.map(function (d) { return d.device; }));
                    if (suffixes.length == 1) {
                        var found = suffixes[0].match(DEVICE_NAME_REGEX);
                        if (found) {
                            suffixes[0] = found[1];
                        }
                    }
                    return deviceParams.map(function (d, i) {
                        return { device: suffixes[i], color: d.color };
                    });
                },
                _getCurrentXlaClusterParams: function (colorByParams) {
                    return colorByParams.xla_cluster;
                },
                _getCurrentGradientParams: function (colorByParams, colorBy) {
                    if (!this._isGradientColoring(this.stats, colorBy)) {
                        return;
                    }
                    var params = colorByParams[colorBy];
                    var minValue = params.minValue;
                    var maxValue = params.maxValue;
                    if (colorBy === ColorBy.MEMORY) {
                        minValue = tf.graph.util.convertUnitsToHumanReadable(minValue, tf.graph.util.MEMORY_UNITS);
                        maxValue = tf.graph.util.convertUnitsToHumanReadable(maxValue, tf.graph.util.MEMORY_UNITS);
                    }
                    else if (colorBy === ColorBy.COMPUTE_TIME) {
                        minValue = tf.graph.util.convertUnitsToHumanReadable(minValue, tf.graph.util.TIME_UNITS);
                        maxValue = tf.graph.util.convertUnitsToHumanReadable(maxValue, tf.graph.util.TIME_UNITS);
                    }
                    return {
                        minValue: minValue,
                        maxValue: maxValue,
                        startColor: params.startColor,
                        endColor: params.endColor,
                    };
                },
                download: function () {
                    this.$.graphdownload.click();
                },
                _updateFileInput: function (e) {
                    var file = e.target.files[0];
                    if (!file)
                        return;
                    // Strip off everything before the last "/" and strip off the file
                    // extension in order to get the name of the PNG for the graph.
                    var filePath = file.name;
                    var dotIndex = filePath.lastIndexOf('.');
                    if (dotIndex >= 0) {
                        filePath = filePath.substring(0, dotIndex);
                    }
                    var lastSlashIndex = filePath.lastIndexOf('/');
                    if (lastSlashIndex >= 0) {
                        filePath = filePath.substring(lastSlashIndex + 1);
                    }
                    this._setDownloadFilename(filePath);
                    this.set('selectedFile', e);
                },
                _datasetsChanged: function (newDatasets, oldDatasets) {
                    if (oldDatasets != null) {
                        // Select the first dataset by default.
                        this._selectedRunIndex = 0;
                    }
                },
                _computeSelection: function (datasets, _selectedRunIndex, _selectedTagIndex, _selectedGraphType) {
                    if (!datasets[_selectedRunIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex]) {
                        return null;
                    }
                    return {
                        run: datasets[_selectedRunIndex].name,
                        tag: datasets[_selectedRunIndex].tags[_selectedTagIndex].tag,
                        type: _selectedGraphType,
                    };
                },
                _selectedRunIndexChanged: function (runIndex) {
                    if (!this.datasets)
                        return;
                    // Reset the states when user pick a different run.
                    this.colorBy = ColorBy.STRUCTURE;
                    this._selectedTagIndex = 0;
                    this._selectedGraphType = this._getDefaultSelectionType();
                    this.$['trace-inputs'].active = false; // Set trace input to off-state.
                    this._setDownloadFilename(this.datasets[runIndex] ? this.datasets[runIndex].name : '');
                },
                _selectedTagIndexChanged: function () {
                    this._selectedGraphType = this._getDefaultSelectionType();
                },
                _getDefaultSelectionType: function () {
                    var _a = this, datasets = _a.datasets, run = _a._selectedRunIndex, tag = _a._selectedTagIndex;
                    if (!datasets ||
                        !datasets[run] ||
                        !datasets[run].tags[tag] ||
                        datasets[run].tags[tag].opGraph) {
                        return tf.graph.SelectionType.OP_GRAPH;
                    }
                    if (datasets[run].tags[tag].profile) {
                        return tf.graph.SelectionType.PROFILE;
                    }
                    if (datasets[run].tags[tag].conceptualGraph) {
                        return tf.graph.SelectionType.CONCEPTUAL_GRAPH;
                    }
                    return tf.graph.SelectionType.OP_GRAPH;
                },
                _getFile: function () {
                    this.$$("#file").click();
                },
                _setDownloadFilename: function (name) {
                    this.$.graphdownload.setAttribute('download', name + '.png');
                },
                _statsNotNull: function (stats) {
                    return stats !== null;
                },
                _toggleLegendOpen: function () {
                    this.set('_legendOpened', !this._legendOpened);
                },
                _getToggleText: function (legendOpened) {
                    return legendOpened ? 'Close legend.' : 'Expand legend.';
                },
                _getToggleLegendIcon: function (legendOpened) {
                    // This seems counter-intuitive, but actually makes sense because the
                    // expand-more button points downwards, and the expand-less button points
                    // upwards. For most collapsibles, this works because the collapsibles
                    // expand in the downwards direction. This collapsible expands upwards
                    // though, so we reverse the icons.
                    return legendOpened ? 'expand-more' : 'expand-less';
                },
                _getSelectionOpGraphDisabled: function (datasets, _selectedRunIndex, _selectedTagIndex) {
                    return !datasets[_selectedRunIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex].opGraph;
                },
                _getSelectionProfileDisabled: function (datasets, _selectedRunIndex, _selectedTagIndex) {
                    return !datasets[_selectedRunIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex].profile;
                },
                _getSelectionConceptualGraphDisabled: function (datasets, _selectedRunIndex, _selectedTagIndex) {
                    return !datasets[_selectedRunIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex] ||
                        !datasets[_selectedRunIndex].tags[_selectedTagIndex].conceptualGraph;
                },
            });
        })(controls = graph.controls || (graph.controls = {}));
    })(graph = tf.graph || (tf.graph = {}));
})(tf || (tf = {})); // namespace tf.graph.controls
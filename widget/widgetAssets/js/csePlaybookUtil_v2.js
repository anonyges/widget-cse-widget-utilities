/* 
  author: kimd@fortinet.com
  modified: 250102 
*/
"use strict";

(function () {
  angular
    .module("cybersponse")
    .factory("csePlaybookUtil_v2", csePlaybookUtil_v2);

  csePlaybookUtil_v2.$inject = [
    "API",
    "$resource",
    "websocketService",
    "Field",
    "FormEntityService",
    "toaster",
    "$filter",
    "$interval",
    "$rootScope",
    "cseJSUtil_v1",
  ];

  function csePlaybookUtil_v2(
    API,
    $resource,
    websocketService,
    Field,
    FormEntityService,
    toaster,
    $filter,
    $interval,
    $rootScope,
    cseJSUtil_v1,
  ) {
    function init(_parent_scope, _config, _playbook_check_interval_milisec) {
      // -------------------------------------------------------- initial factory start --------------------------------------------------------
      const scope = _parent_scope.$new(true);
      scope.config = cseJSUtil_v1.default_value_as_object(_config);

      const form_entity = FormEntityService.get();
      const playbook_check_interval_milisec =
        cseJSUtil_v1.default_value_if_undefined(
          _playbook_check_interval_milisec,
          2000,
        );

      scope.data_cs_playbook_result = new Field({
        formType: "json",
        writeable: false,
        validation: { required: true },
      });
      scope.data_cs_playbook_result_model = "";

      scope.$on("websocket:reconnect", function () {
        playbook_websocket_resubscribe();
      });

      scope.$on("$destroy", function () {
        playbook_websocket_unsubscribe();
      });
      // -------------------------------------------------------- initial factory end --------------------------------------------------------

      // -------------------------------------------------------- playbook service start --------------------------------------------------------
      // Targeted to run only 1 active playbook at the time
      let playbook_task_id = "";
      let forced_playbook_check_interval = null;
      let playbook_websocket_subscriptions = [];

      scope.playbook_status = "";
      scope.workflow_id = 0;

      function format_workflow_id(_workflow_id) {
        const re = /\/wf\/api\/workflows\/(\d+)\//;
        const regex_match = re.exec(_workflow_id);
        if (regex_match) scope.workflow_id = regex_match[1];
        else scope.workflow_id = _workflow_id;
        return scope.workflow_id;
      }

      function playbook_websocket_unsubscribe() {
        if (forced_playbook_check_interval)
          $interval.cancel(forced_playbook_check_interval);
        // canceling forced interval checks of playbook

        for (const _idx in playbook_websocket_subscriptions) {
          playbook_websocket_subscriptions[_idx].unsubscribe();
        }
        playbook_websocket_subscriptions = [];
      }

      function playbook_websocket_resubscribe() {
        // console.debug("playbook_websocket_resubscribe");
        playbook_websocket_unsubscribe();

        if (playbook_task_id !== "") get_playbook_result();
        // after disconnection of the websocket, when the socket is reconnected, try to call the last executed playbook to get the result

        websocketService
          .subscribe("runningworkflow", function (_json_result) {
            // this is the part when the data is recieved from runningworkflow something like json_data of an actual data
            // console.debug("runningworkflow", _json_data);
            check_playbook_completion(_json_result);
          })
          .then(function (_websocket_sub_id) {
            // this is the part when the websocket is subscribed an data is websocket "{id: 'sub-9', unsubscribe: ƒ}""
            // console.debug(`websocketService runningworkflow subscribed: `, _websocket_sub_id);
            playbook_websocket_subscriptions.push(_websocket_sub_id);
          })
          .catch(function (_error) {
            // console.debug(`websocketService runningworkflow failed: `, _error);
            // when the websocketService subscription failed force interval...
            // seems this never gets hit due to no error returned in subscribing workflow
          });
        // getting the runningworkflow (playbook) by websocket
      }

      function check_playbook_completion(_json_data) {
        if (
          _json_data.task_id &&
          playbook_task_id === _json_data.task_id &&
          _json_data.status &&
          "null" === _json_data.parent_wf
        ) {
          scope.playbook_status = _json_data.status;
          scope.$emit("a_playbook_status", {
            status: scope.playbook_status,
            workflow_id: format_workflow_id(_json_data["instance_ids"]),
            response: _json_data,
          });
          if (
            "finished" === _json_data.status ||
            "finished_with_error" === _json_data.status
          ) {
            get_playbook_result();
          } else if ("failed" === _json_data.status) {
            toaster.error({
              body: `Playbook execution ended with 'failed' status. Please revise your playbook. Workflow id: ${_json_data["instance_ids"]}`,
            });
            playbook_task_id = "";
          } else {
            // playbook is in other state
          }
        }
      }

      function get_playbook_result() {
        if (playbook_task_id === "") {
          toaster.error({
            body: `Trying to get the result of playbook that the playbook_task_id has been removed, possible error in the code`,
          });
          return;
        }
        // when the playbook_task_id is "" it already has been processed or exception occurred

        $resource(
          API.WORKFLOW +
            "api/workflows/log_list/?format=json&parent__isnull=True&task_id=" +
            playbook_task_id,
        )
          .save()
          .$promise.then(function (_response) {
            scope.playbook_status = _response["hydra:member"][0]["status"];
            scope.$emit("a_playbook_status", {
              status: scope.playbook_status,
              workflow_id: format_workflow_id(
                _response["hydra:member"][0]["@id"],
              ),
              response: _response,
            });

            if (
              "finished" === scope.playbook_status ||
              "finished_with_error" === scope.playbook_status
            ) {
              get_playbook_last_step_result(
                _response["hydra:member"][0]["@id"],
              );
            } else if ("failed" === scope.playbook_status) {
              if (forced_playbook_check_interval)
                $interval.cancel(forced_playbook_check_interval);
              // cleans up if we get the last_step_result

              toaster.error({
                body: `Playbook has '${scope.playbook_status}' status. Please revise your playbook.`,
              });
              playbook_task_id = "";
            } else {
              toaster.error({
                body: `Playbook has '${scope.playbook_status}' status.`,
              });
              // playbook is in other state probably awaiting
            }
          })
          .catch(function (_error) {
            console.error(_error);
          });
      }

      function get_playbook_last_step_result(instance_id) {
        if (forced_playbook_check_interval)
          $interval.cancel(forced_playbook_check_interval);
        // cleans up if we get the last_step_result

        $resource("api" + instance_id + "?")
          .get({})
          .$promise.then(function (_response) {
            scope.playbook_status = _response["status"];
            scope.$emit("a_playbook_status", {
              status: scope.playbook_status,
              workflow_id: format_workflow_id(_response["@id"]),
              response: _response,
            });
          })
          .catch(function (_error) {
            scope.playbook_status = "unknown error";
            toaster.error({
              body: `Fetching playbook ${instance_id} failed with unknown error: ${_error}, please re-run playbook to fetch result.`,
            });
          })
          .finally(function (_) {
            playbook_task_id = "";
          });
      }

      function execute_playbook(_playbook, _params) {
        if (forced_playbook_check_interval)
          $interval.cancel(forced_playbook_check_interval);
        if (
          playbook_websocket_subscriptions.length == 0 ||
          !$rootScope.websocketConnected
        )
          forced_playbook_check_interval = $interval(
            get_playbook_result,
            playbook_check_interval_milisec,
          );
        // forcing interval checks of playbook

        if (!_params) _params = {};
        _params["force_debug"] = true;

        if (form_entity === undefined) {
          const api_endpoint = API.MANUAL_TRIGGER + _playbook.uuid;

          $resource(api_endpoint)
            .save(_params)
            .$promise.then(function (_response) {
              const task_ids =
                _response.task_id !== undefined
                  ? [_response.task_id]
                  : _response.task_ids;
              playbook_task_id = task_ids[0];
              console.debug(`executed playbook task_id: ${playbook_task_id}`);
            })
            .catch(function (_error) {
              console.error(_error);
            });
        } else {
          const api_endpoint =
            API.ACTION_TRIGGER +
            $filter("getEndPathName")(_playbook.triggerStep);

          _params["records"] = [form_entity["originalData"]["@id"]];
          _params["__resource"] = form_entity.module;
          _params["__uuid"] = _playbook.uuid;
          _params["singleRecordExecution"] = true;

          $resource(api_endpoint)
            .save(_params)
            .$promise.then(function (_response) {
              const task_ids =
                _response.task_id !== undefined
                  ? [_response.task_id]
                  : _response.task_ids;
              playbook_task_id = task_ids[0];
              console.debug(`executed playbook task_id: ${playbook_task_id}`);
            })
            .catch(function (_error) {
              console.error(_error);
            });
        }
      }
      // -------------------------------------------------------- playbook service end --------------------------------------------------------

      // -------------------------------------------------------- UI start  --------------------------------------------------------
      function bt_csOpenExecutionLog() {
        $rootScope.$broadcast("csOpenExecutionLog", scope.workflow_id);
      }

      function bt_clear_data_cs_selected_playbook() {
        scope.playbook_status = "";
        scope.workflow_id = null;
        scope.data_cs_playbook_result_model = null;
        scope.config.data_cs_selected_playbook = null;
      }
      // -------------------------------------------------------- UI end  --------------------------------------------------------

      // -------------------------------------------------------- connection update start  --------------------------------------------------------
      playbook_websocket_resubscribe();
      // -------------------------------------------------------- connection update end  --------------------------------------------------------

      const service = {
        format_workflow_id: format_workflow_id,
        playbook_websocket_unsubscribe: playbook_websocket_unsubscribe,
        playbook_websocket_resubscribe: playbook_websocket_resubscribe,
        check_playbook_completion: check_playbook_completion,
        get_playbook_result: get_playbook_result,
        get_playbook_last_step_result: get_playbook_last_step_result,
        execute_playbook: execute_playbook,

        bt_csOpenExecutionLog: bt_csOpenExecutionLog,
        bt_clear_data_cs_selected_playbook: bt_clear_data_cs_selected_playbook,

        scope: scope,
      };

      return service;
    }

    return {
      init: function (
        _parent_scope,
        _config,
        _playbook_check_interval_milisec,
      ) {
        return new init(
          _parent_scope,
          _config,
          _playbook_check_interval_milisec,
        );
      },
    };
  }
})();

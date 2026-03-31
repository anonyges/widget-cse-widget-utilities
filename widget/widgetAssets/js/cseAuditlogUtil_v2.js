/* 
  author: kimd@fortinet.com
  modified: 250102
*/
"use strict";

(function () {
  angular
    .module("cybersponse")
    .factory("cseAuditlogUtil_v2", cseAuditlogUtil_v2);

  cseAuditlogUtil_v2.$inject = [
    "$resource",
    "FormEntityService",
    "cseJSUtil_v1",
  ];

  function cseAuditlogUtil_v2(
    $resource,
    FormEntityService,
    cseJSUtil_v2,
  ) {
    function init(_parent_scope, _config) {
      // -------------------------------------------------------- initial factory start --------------------------------------------------------
      const scope = _parent_scope.$new(true);
      scope.config = _config ?? {};
      const form_entity = FormEntityService.get();

      scope.$on("$destroy", function () {
        console.debug(`\$destroy called from ${scope.$id}`);
      });
      // -------------------------------------------------------- initial factory end --------------------------------------------------------

      // -------------------------------------------------------- services start --------------------------------------------------------
      function get_auditlogs(
        page,
        limit,
        entityUuid,
        search,
        operation,
        startDate,
        endDate,
        userId,
      ) {
        const payload = Object();
        payload["page"] = page ? page : 0; // integer
        payload["limit"] = limit ? limit : 0; // integer
        payload["entityUuid"] = entityUuid
          ? entityUuid
          : form_entity["originalData"]["uuid"]; // uuid_v4
        if (operation) payload["operation"] = operation; // one of ["Comment", "Create", "Executed Action", "Import", "Link", "Replication Failed", "Trigger", "Unlink", "Update", "Update During Import"]
        if (search) payload["search"] = search; // string
        if (startDate) payload["startDate"] = startDate; // milisec timestamp
        if (endDate) payload["endDate"] = endDate; // milisec timestamp
        if (userId) payload["userId"] = userId; // uuid_v4

        // { // response
        //   "number": 0,
        //   "content": [], // default sort content new[0] --> old[n]
        //   "first": true
        // }

        return $resource("/api/gateway/audit/activities").save(payload)
          .$promise;
      }

      function traverse_auditlogs(
        page,
        search_field_title,
        end_search_field_option_itemValue,
        auditlog_array,
      ) {
        get_auditlogs(page, 10, null, search_field_title, "Update")
          .then(function (_response) {
            for (const _res of _response["content"]) {
              if (
                _res["data"].hasOwnProperty(search_field_title) &&
                _res["operation"] == "Update"
              ) {
                auditlog_array.push({
                  old_data: _res["data"]["oldData"],
                  new_data: _res["data"]["newData"],
                  transactionDate: _res["transactionDate"],
                });
                if (
                  end_search_field_option_itemValue ==
                  _res["data"][search_field_title]["oldData"]
                ) {
                  scope.$emit("d_traverse_auditlogs_finished", {
                    data: auditlog_array,
                  });
                  return;
                }
                // if found the slapicklist has changed once!
              }
            }

            if (_response["content"].length == 0) {
              get_auditlogs(page, 10, null, null, "Create")
                .then(function (_response) {
                  if (_response["content"].length != 1) {
                    console.error(
                      "auditlog search issue! auditlog perged or created 2 times which doesn't make sense",
                      _response,
                    );
                    scope.$emit("d_traverse_auditlogs_finished", {
                      data: auditlog_array,
                      status: "error",
                    });
                    return;
                  }

                  if (
                    end_search_field_option_itemValue ==
                    _response["content"][0]["data"][search_field_title]
                  ) {
                    // first of the auditlog!
                    auditlog_array.push({
                      new_data:
                        _response["content"][0]["data"][search_field_title],
                      transactionDate:
                        _response["content"][0]["transactionDate"],
                    });
                    scope.$emit("d_traverse_auditlogs_finished", {
                      data: auditlog_array,
                    });
                    return;
                  }

                  scope.$emit("d_traverse_auditlogs_finished", {
                    data: auditlog_array,
                    status: "error",
                    error:
                      "no auditlog found! auditlog has been probably perged?",
                  });
                })
                .catch(function (_error) {
                  console.error(_error);
                });
            } else
              traverse_auditlogs(
                page + 1,
                search_field_title,
                end_search_field_option_itemValue,
                auditlog_array,
              );
          })
          .catch(function (_error) {
            console.error(_error);
          });
      }
      // -------------------------------------------------------- services end --------------------------------------------------------

      const service = {
        get_auditlogs: get_auditlogs,
      };

      return service;
    }

    return {
      init: function (_parent_scope, _config) {
        return new init(_parent_scope, _config);
      },
    };
  }
})();

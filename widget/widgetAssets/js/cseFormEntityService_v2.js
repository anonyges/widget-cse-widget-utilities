/* 
  author: kimd@fortinet.com
  modified: 260221
*/
"use strict";

(function () {
  angular
    .module("cybersponse")
    .factory("cseFormEntityService_v2", cseFormEntityService_v2);

  cseFormEntityService_v2.$inject = [
    "$resource",
    "$http",
    "$timeout",
    "$q",
    "websocketService",
    "Field",
    "FormEntityService",
    "Entity",
    "cseJSUtil_v2",
  ];

  function cseFormEntityService_v2(
    $resource,
    $http,
    $timeout,
    $q,
    websocketService,
    Field,
    FormEntityService,
    Entity,
    cseJSUtil_v2,
  ) {
    // This cseFormEntityService_v2 let's you listen to the changes of the fields in current record.

    function fieldUpdateManager(scope) {
      this.scope = scope;
      // unknown
      // this.scope.manual_field_override = {};
      // this.scope.data_cs_conditional_module_field = parent_scope.config[uuid]?.data_cs_conditional_module_field ?? {};

      scope.csefes = Object.assign({}, scope.csefes);
      scope.config.csefes = Object.assign({}, scope.config.csefes);

      this.scopeDat = scope.csefes;
      this.configDat = scope.config.csefes;

      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      // listing the module fields to be selected
      scopeDat.module_field_names = {};
      scopeDat.selected_module_field_name = null;

      // fields that will be monitored.
      configDat.monitored_fields = Object.assign(
        {},
        configDat.monitored_fields,
      );

      // editing the linked field options.
      scopeDat.current_editing_field = {
        name: "",
        templates: {},
      };

      // subscribtion for websockets.
      scopeDat.websockets = [];

      // get bulk to reduce server calls
      scopeDat.realtime_fields = { pending: [], timeoutPromise: null };

      scope.$on("csefes_field_override_value", function (event, data) {
        // i forgot why I wrote this code..
        // scope.manual_field_override[data.field_name] =
        //   scope.manual_field_override[data.field_name] ?? {};
        // scope.manual_field_override[data.field_name] = Object.assign(
        //   {},
        //   scope.manual_field_override[data.field_name],
        //   data.records,
        // );
        // if (Object.hasOwn(config.monitored_fields, data.field_name)) {
        //   scope.$emit("csefes_field_updated", {
        //     field_name: data.field_name,
        //   });
        // }
      });

      scope.$on("field:updated", (event, data) => {
        // This can be called when there is an UI change so duplicating with websocket but, can get value even websocket is disconnected.
        // Keeping this code as backwards compatibility
        console.debug("field:updated: ", data);

        data?.forEach((field_name) => {
          if (Object.hasOwn(configDat.monitored_fields, field_name))
            scopeDat.realtime_fields.pending[field_name] = null;
        });
      });

      scope.$on("websocket:reconnect", (event, data) => {
        console.debug(`websocket:reconnect called from ${scope.$id}`);
        this.websocket_resubscribe();
      });

      scope.$on("$destroy", (event, data) => {
        console.debug(`\$destroy called from ${scope.$id}`);
        this.websocket_unsubscribe();
      });
    }

    function is_field_type_linked(formEntity, field_name) {
      const linked_field_types = [
        "manyToMany",
        "oneToMany",
        "manyToOne",
        "lookup",
      ];
      if (linked_field_types.includes(formEntity.fields[field_name].type))
        return true;
      return false;
    }

    fieldUpdateManager.prototype.refresh_module_field_names = function () {
      const { scope } = this;
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      const formEntity = FormEntityService.get();

      // if formEntity not defined set to alerts to debug
      const entityModule =
        formEntity !== undefined ? formEntity.module : "alerts";

      const entity = new Entity(entityModule);

      entity.loadFields().then(() => {
        Object.entries(entity.fields).forEach(([key, value]) => {
          if (!Object.hasOwn(configDat.monitored_fields, key)) {
            scopeDat.module_field_names[key] = {};
          }
        });
      });
    };

    fieldUpdateManager.prototype.bt_add_monitored_field = function (
      field_name,
    ) {
      // 1. Correctly extract the scope from the instance
      const scope = this;
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      // 2. Defensive check: Avoid adding duplicates
      if (!Object.hasOwn(configDat.monitored_fields, field_name)) {
        configDat.monitored_fields[field_name] = {};
      }

      // 3. Functional removal from available fields
      // This replaces the risky indexOf/splice pattern
      delete scopeDat.module_field_names[field_name];

      // 4. Emit the event
      scope.$emit("csefes_add_monitored_field", field_name);
    };

    fieldUpdateManager.prototype.check_monitored_field = function (field_name) {
      const formEntity = FormEntityService.get();
      if (!formEntity) return true;

      if (is_field_type_linked(formEntity, field_name)) return true;
      return false;
    };

    fieldUpdateManager.prototype.bt_edit_monitored_field = function (
      field_name,
    ) {
      const scope = this;
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      const entity = new Entity(field_name);
      entity.loadFields().then(() => {
        scopeDat.current_editing_field.name = field_name;

        // force the array to be turned into an object because when an object is empty the saving mech does not work..
        configDat.monitored_fields[field_name] = Object.assign(
          {},
          configDat.monitored_fields[field_name],
        );
        const monitored_field = configDat.monitored_fields[field_name];

        // Limit, return as integer system.
        scopeDat.current_editing_field.templates.$limit = new Field({
          formType: "integer",
          writeable: true,
          validation: {
            required: false,
          },
        });
        monitored_field.$limit = monitored_field?.$limit ?? 30;

        // Entity fields, return as a tagging system.
        const entity_field_names = cseJSUtil_v2.getObjectKeySorted(
          entity.fields,
        );
        scopeDat.current_editing_field.templates.__selectFields = (query) => {
          return entity_field_names.filter((item) => item.startsWith(query));
        };
        monitored_field.__selectFields = monitored_field?.__selectFields ?? [];

        // Entity filtering
        scopeDat.current_editing_field.templates.filters = entity.fields;
        // monitored_field.filters = monitored_field?.filters ?? {};
      });
    };

    fieldUpdateManager.prototype.bt_remove_monitored_field = function (
      field_name,
    ) {
      const scope = this;
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      // 1. Logic Guard: Handle UI toggle
      if (
        scopeDat.edit_module_field_to_watch_ng_show &&
        field_name === scopeDat.data_cs_conditional_selected_module_field_name
      ) {
        scopeDat.edit_module_field_to_watch_ng_show = false;
      }

      // 2. Functional Array Update (Immutability-friendly)
      // Instead of indexOf/splice, we filter the list
      delete configDat.monitored_fields[field_name];

      // 3. Update the available fields list
      if (!Object.hasOwn(scopeDat.module_field_names, field_name)) {
        scopeDat.module_field_names[field_name] = {};
      }

      // 4. Emit changes to the monitored_field
      scope.$emit("csefes_remove_monitored_field", field_name);
    };

    function get_realtime_field(scope) {
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      if (
        cseJSUtil_v2.getObjectKeyLength(scopeDat.realtime_fields.pending) == 0
      ) {
        scopeDat.realtime_fields.timeoutPromise = $timeout(
          get_realtime_field,
          1000,
          true,
          scope,
        );
        return;
      }

      const formEntity = FormEntityService.get();
      if (!formEntity) return; // check if FormEntity is current data that the user is viewing.

      const selectFields = cseJSUtil_v2.getObjectKeySorted(
        scopeDat.realtime_fields.pending,
      );

      // extracting fields type linked
      const selectedLinkedFields = {};
      for (let i = selectFields.length - 1; i >= 0; i--) {
        const field_name = selectFields[i];
        if (is_field_type_linked(formEntity, field_name)) {
          selectFields.splice(i, 1);
          selectedLinkedFields[field_name] =
            scopeDat.realtime_fields.pending[field_name];
        }
      }

      // 1. Create an object to hold your promises
      const promiseMap = {};

      // getting the value for the normal field types
      const search_query = {
        logic: "AND",
        filters: [
          {
            field: "uuid",
            operator: "eq",
            value: formEntity.id,
          },
        ],
        __selectFields: selectFields,
      };
      promiseMap["_"] = $resource(`/api/query/${formEntity.module}`)
        .save(search_query)
        .$promise.then((data) => {
          // console.debug("realtimedata: ", data);
          const module_fields = data?.["hydra:member"]?.[0];
          scope.$emit("csefes_updated_fields", module_fields);
        })
        .catch((_error) => {
          console.error(_error);
        });

      // getting the value for the linked field types
      Object.entries(selectedLinkedFields).forEach(([key, value]) => {
        const search_query = {};

        // limit setting
        const limit = value?.$limit ?? 30;

        // have to transform the search_query into correct schema
        search_query.__selectFields = [];
        if (value?.__selectFields && value.__selectFields.length > 0)
          value.__selectFields.forEach((item) => {
            search_query.__selectFields.push(item.text);
          });

        // append the first filters to be uuid for the current module
        search_query.logic = "AND";
        search_query.filters = [];
        search_query.filters.push({
          field: `${formEntity.module}.uuid`,
          operator: "eq",
          value: formEntity.id,
        });

        const inner_filters = {
          ...(value?.filters?.logic && { logic: value?.filters?.logic }),
          ...(value?.filters?.filters && { filters: value?.filters?.filters }),
        };
        search_query.filters.push(inner_filters);

        promiseMap[key] = $resource(`/api/query/${key}?$limit=${limit}`)
          .save(search_query)
          .$promise.then((data) => {
            // console.debug("realtimedata: ", data);
            const module_fields = data?.["hydra:member"];
            const retval = {};
            retval[key] = module_fields;
            scope.$emit("csefes_updated_fields", retval);
          })
          .catch((_error) => {
            console.error(_error);
          });
      });

      // collect if everything finished
      $q.all(promiseMap).then(() => {
        scopeDat.realtime_fields.pending = {};
        scopeDat.realtime_fields.timeoutPromise = null;
        scopeDat.realtime_fields.timeoutPromise = $timeout(
          get_realtime_field,
          1000,
          true,
          scope,
        );
      });
    }

    fieldUpdateManager.prototype.websocket_unsubscribe = function () {
      console.log("websocket_unsubscribe");

      const { scope } = this;
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      scopeDat.websockets.forEach((ws) => ws.unsubscribe());
      scopeDat.websockets = [];

      if (scopeDat.realtime_fields.timeoutPromise) {
        $timeout.cancel(scopeDat.realtime_fields.timeoutPromise);
        scopeDat.realtime_fields.timeoutPromise = null;
      }
    };

    fieldUpdateManager.prototype.websocket_resubscribe = function () {
      const { scope } = this;
      const scopeDat = scope.csefes;
      const configDat = scope.config.csefes;

      this.websocket_unsubscribe();

      // console log must be below websocket_unsubscribe due to causing confusion.
      console.log("websocket_resubscribe");

      const formEntity = FormEntityService.get();
      if (!formEntity) return; // check if FormEntity is current data that the user is viewing.

      scopeDat.realtime_fields.timeoutPromise = $timeout(
        get_realtime_field,
        1000,
        true,
        scope,
      );

      // const current_record_ws_path = `${formEntity.module}/${formEntity.id}`;
      const current_record_ws_path = `${formEntity.module}/${formEntity.id}`;
      const current_entityUuid = `/api/3/${formEntity.module}/${formEntity.id}`;

      // for listening the text, json, number data, "link operation"
      websocketService
        .subscribe(current_record_ws_path, (data) => {
          console.debug("current record websocket: ", data);

          if (data.entityUuid.includes(current_entityUuid)) {
            data.changeData?.forEach((field_name) => {
              if (Object.hasOwn(configDat.monitored_fields, field_name)) {
                scopeDat.realtime_fields.pending[field_name] =
                  configDat.monitored_fields[field_name] ?? null;
              }
            });

            const areEqual = (a, b) => {
              if (a.length !== b.length) return false;
              const s1 = [...a].sort();
              const s2 = [...b].sort();
              return s1.every((val, i) => val === s2[i]);
            };
            if (areEqual(data.changeData, ["modifyDate", "modifyUser"])) {
              // it means that modifyDate and modifyUser has changed. likely that the record linked is unlinked. thus, loop through all the changes.
              // FortiSOAR does not add field to websocket if record is linked is unlinked, only changes by "modifyDate", "modifyUser"...
              Object.entries(configDat.monitored_fields).forEach(
                ([key, value]) => {
                  if (is_field_type_linked(formEntity, key)) {
                    scopeDat.realtime_fields.pending[key] = value;
                  }
                },
              );
            }
          }
        })
        .then((data) => {
          scopeDat.websockets.push(data);
        });

      // code removed as 7.6.5 due to performance reasons(?)
      // for listening the linked data such as many to many
      // this code only works when linked but not the unlink... why? IDK bad code design prob
      // Object.entries(configDat.monitored_fields).forEach(([key, value]) => {
      //   if (scopeDat.linked_field_types.includes(formEntity.fields[key].type)) {
      //     // This will trigger when the alerts connected incidents is updated. url example) alerts/uuid/incidents
      //     websocketService
      //       .subscribe(current_record_ws_path + "/" + key, (data) => {
      //         console.debug("linked record websocket: ", data);
      //         if (data.entityUuid.includes(formEntity.id)) {
      //           data.changeData?.forEach((field_name) => {
      //             if (Object.hasOwn(configDat.monitored_fields, field_name))
      //               scopeDat.realtime_fields.pending[field_name] = null; // i am not sure if this is related data field name or my field name
      //           });
      //         }
      //       })
      //       .then(function (data) {
      //         scope.websockets.push(data);
      //       });
      //   }
      // });
    };

    // --------------------------------------------- view.controller.js ---------------------------------------------

    // --------------------------------------------- view.controller.js End ---------------------------------------------

    return {
      init_edit: function (scope) {
        const fum = new fieldUpdateManager(scope);
        fum.refresh_module_field_names();

        // adding buttons
        scope.bt_add_monitored_field = fum.bt_add_monitored_field;
        scope.check_monitored_field = fum.check_monitored_field;
        scope.bt_remove_monitored_field = fum.bt_remove_monitored_field;
        scope.bt_edit_monitored_field = fum.bt_edit_monitored_field;

        return fum;
      },
      init_view: function (scope) {
        const fum = new fieldUpdateManager(scope);
        Object.entries(fum.configDat.monitored_fields).forEach(
          ([key, value]) => {
            fum.scopeDat.realtime_fields.pending[key] = value;
          },
        );
        fum.websocket_resubscribe();

        return fum;
      },
    };
  }
})();

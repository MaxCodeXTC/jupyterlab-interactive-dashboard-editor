import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';

import { INotebookTracker } from '@jupyterlab/notebook';

import {
  WidgetTracker,
  Dialog,
  showDialog,
  showErrorMessage,
} from '@jupyterlab/apputils';

import { Widget } from '@lumino/widgets';

import { Dashboard } from './dashboard';

import { DashboardWidget } from './widget';

import { DashboardButton } from './button';

// HTML element classes

const RENAME_DIALOG_CLASS = 'pr-RenameDialog';

const RENAME_TITLE_CLASS = 'pr-RenameTitle';

/**
 * Command IDs used
 */
namespace CommandIDs {
  export const printTracker = 'notebook:print-tracker';

  export const addToDashboard = 'notebook:add-to-dashboard';

  export const renameDashboard = 'dashboard:rename-dashboard';

  export const deleteOutput = 'dashboard:delete-dashboard-widget';

  export const insert = 'dashboard:insert';

  export const undo = 'dashboard:undo';

  export const redo = 'dashboard:redo';

  export const save = 'dashboard:save';

  export const load = 'dashboard:load';
}

const extension: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-interactive-dashboard-editor',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker): void => {
    console.log('JupyterLab extension presto is activated!');

    // Datastore for Dashboard info
    // TODO

    // Tracker for Dashboard
    const dashboardTracker = new WidgetTracker<Dashboard>({
      namespace: 'dashboards',
    });

    //Tracker for DashboardWidgets
    const outputTracker = new WidgetTracker<DashboardWidget>({
      namespace: 'dashboard-outputs',
    });

    addCommands(app, tracker, dashboardTracker, outputTracker);

    // Adds commands to code cell context menu.
    // Puts command entries in a weird place in the right-click menu--
    // between 'Clear Output' and 'Clear All Outputs'
    // 'Clear Output' is end of selector='.jp-Notebook .jp-CodeCell'
    // and 'Clear All Outputs' is start of selector='.jp-Notebook'
    app.contextMenu.addItem({
      command: CommandIDs.printTracker,
      selector: '.jp-Notebook .jp-CodeCell',
      rank: 13,
    });

    app.contextMenu.addItem({
      command: CommandIDs.save,
      selector: '.pr-JupyterDashboard',
      rank: 3,
    });

    app.contextMenu.addItem({
      command: CommandIDs.load,
      selector: '.jp-Notebook',
      rank: 15,
    });

    app.contextMenu.addItem({
      command: CommandIDs.renameDashboard,
      selector: '.pr-JupyterDashboard',
      rank: 0,
    });

    app.contextMenu.addItem({
      command: CommandIDs.undo,
      selector: '.pr-JupyterDashboard',
      rank: 1,
    });

    app.contextMenu.addItem({
      command: CommandIDs.redo,
      selector: '.pr-JupyterDashboard',
      rank: 2,
    });

    app.contextMenu.addItem({
      command: CommandIDs.deleteOutput,
      selector: '.pr-DashboardWidget',
      rank: 0,
    });

    // Add commands to key bindings
    app.commands.addKeyBinding({
      command: CommandIDs.deleteOutput,
      args: {},
      keys: ['Backspace'],
      selector: '.pr-DashboardWidget',
    });

    app.commands.addKeyBinding({
      command: CommandIDs.undo,
      args: {},
      keys: ['Z'],
      selector: '.pr-JupyterDashboard',
    });

    app.commands.addKeyBinding({
      command: CommandIDs.redo,
      args: {},
      keys: ['Shift Z'],
      selector: '.pr-JupyterDashboard',
    });

    app.docRegistry.addWidgetExtension(
      'Notebook',
      new DashboardButton(app, outputTracker, dashboardTracker, tracker)
    );
  },
};

function addCommands(
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  dashboardTracker: WidgetTracker<Dashboard>,
  outputTracker: WidgetTracker<DashboardWidget>
): void {
  const { commands, shell } = app;

  /**
   * Whether there is an active notebook.
   * jupyterlab/packages/notebook-extension/src/index.ts
   */
  function isEnabled(): boolean {
    return (
      tracker.currentWidget !== null &&
      tracker.currentWidget === shell.currentWidget
    );
  }

  /**
   * Whether there is an notebook active, with a single selected cell.
   * jupyterlab/packages/notebook-extension/src/index.ts
   */
  function isEnabledAndSingleSelected(): boolean {
    if (!isEnabled()) {
      return false;
    }
    const { content } = tracker.currentWidget!;
    const index = content.activeCellIndex;
    // If there are selections that are not the active cell,
    // this command is confusing, so disable it.
    for (let i = 0; i < content.widgets.length; ++i) {
      if (content.isSelected(content.widgets[i]) && i !== index) {
        return false;
      }
    }
    return true;
  }

  async function getPath(): Promise<string> {
    const path = await showDialog({
      title: 'Load Path',
      body: new Private.PathHandler(),
      focusNodeSelector: 'input',
      buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Load' })],
    }).then((result) => {
      return result.value;
    });
    return path;
  }

  /**
   * Deletes a selected DashboardWidget.
   */
  commands.addCommand(CommandIDs.deleteOutput, {
    label: 'Delete Output',
    execute: (args) => {
      const widget = outputTracker.currentWidget;
      dashboardTracker.currentWidget.deleteWidgetInfo(widget);
      dashboardTracker.currentWidget.deleteWidget(widget);
    },
  });

  /**
   * Undo the last change to a dashboard.
   */
  commands.addCommand(CommandIDs.undo, {
    label: 'Undo',
    execute: (args) => {
      dashboardTracker.currentWidget.undo();
      console.log('undo');
    },
    isEnabled: () =>
      dashboardTracker.currentWidget &&
      dashboardTracker.currentWidget.store.hasUndo(),
  });

  /**
   * Redo the last undo to a dashboard.
   */
  commands.addCommand(CommandIDs.redo, {
    label: 'Redo',
    execute: (args) => {
      dashboardTracker.currentWidget.redo();
      console.log('redo');
    },
    isEnabled: () =>
      dashboardTracker.currentWidget &&
      dashboardTracker.currentWidget.store.hasRedo(),
  });

  /**
   * Creates a dialog for renaming a dashboard.
   */
  commands.addCommand(CommandIDs.renameDashboard, {
    label: 'Rename Dashboard',
    execute: (args) => {
      // Should this be async? Still kind of unclear on when that needs to be used.
      if (dashboardTracker.currentWidget) {
        showDialog({
          title: 'Rename Dashboard',
          body: new Private.RenameHandler(),
          focusNodeSelector: 'input',
          buttons: [
            Dialog.cancelButton(),
            Dialog.okButton({ label: 'Rename' }),
          ],
        }).then((result) => {
          if (!result.value) {
            return;
          }
          // TODO: Add valid name checking. This currently does nothing.
          const validName = true;
          if (!validName) {
            void showErrorMessage(
              'Rename Error',
              Error(`"${result.value}" is not a valid name for a dashboard.`)
            );
            return;
          }
          dashboardTracker.currentWidget.setName(result.value as string);
          dashboardTracker.currentWidget.update();
        });
      }
    },
  });

  /**
   * Logs the outputTracker to console for debugging.
   */
  commands.addCommand(CommandIDs.printTracker, {
    label: 'Print Tracker',
    execute: (args) => {
      console.log(outputTracker);
    },
    isEnabled: isEnabledAndSingleSelected,
    isVisible: () => false,
  });

  commands.addCommand(CommandIDs.save, {
    label: 'Save Dashboard',
    execute: (args) => dashboardTracker.currentWidget.save(tracker),
  });

  commands.addCommand(CommandIDs.load, {
    label: 'Load Dashboard',
    execute: async (args) => {
      const path = await getPath();
      if (path === undefined) {
        console.log('invalid path');
        return;
      }
      const dashboard = await Dashboard.load(path, tracker, outputTracker);
      const currentNotebook = tracker.currentWidget;
      currentNotebook.context.addSibling(dashboard, {
        ref: currentNotebook.id,
        mode: 'split-bottom',
      });
    },
  });

  /**
   * Adds the currently selected cell's output to the dashboard.
   * Currently only supports a single dashboard view at a time.
   */
  //   commands.addCommand(CommandIDs.addToDashboard, {
  //     label: 'Add to Dashboard',
  //     execute: (args) => {
  //       if (!getCurrentDashboard()) {
  //         insertWidget({ createNew: true });
  //       } else {
  //         insertWidget({});
  //       }
  //     },
  //     isEnabled: isEnabledAndSingleSelected,
  //   });
  // }
}

/**
 * A namespace for private data.
 */
namespace Private {
  export class PathHandler extends Widget {
    constructor() {
      const node = document.createElement('div');

      const nameTitle = document.createElement('label');
      nameTitle.textContent = 'Load Path';
      const path = document.createElement('input');

      node.appendChild(nameTitle);
      node.appendChild(path);

      super({ node });
    }

    /**
     * Get the input text node.
     */
    get inputNode(): HTMLInputElement {
      return this.node.getElementsByTagName('input')[0] as HTMLInputElement;
    }

    /**
     * Get the value of the widget.
     */
    getValue(): string {
      return this.inputNode.value;
    }
  }

  /**
   * A widget used to rename dashboards.
   * jupyterlab/packages/docmanager/src/dialog.ts
   */
  export class RenameHandler extends Widget {
    /**
     * Construct a new "rename" dialog.
     */
    constructor() {
      const node = document.createElement('div');

      const nameTitle = document.createElement('label');
      nameTitle.textContent = 'New Name';
      nameTitle.className = RENAME_TITLE_CLASS;
      const name = document.createElement('input');

      node.appendChild(nameTitle);
      node.appendChild(name);

      super({ node });
      this.addClass(RENAME_DIALOG_CLASS);
    }

    /**
     * Get the input text node.
     */
    get inputNode(): HTMLInputElement {
      return this.node.getElementsByTagName('input')[0] as HTMLInputElement;
    }

    /**
     * Get the value of the widget.
     */
    getValue(): string {
      return this.inputNode.value;
    }
  }
}

export default extension;

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Net from "net";
import { DEBUG_TYPES } from "./debuggingConfiguration/debugConfigTypesAndConstants";
import { RNDebugSession } from "../debugger/rnDebugSession";
import { DebugSessionBase, TerminateEventArgs } from "../debugger/debugSessionBase";
import { DirectDebugSession } from "../debugger/direct/directDebugSession";

export class ReactNativeSessionManager
    implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable {
    private servers = new Map<string, Net.Server>();
    private connections = new Map<string, Net.Socket>();

    public createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        executable: vscode.DebugAdapterExecutable | undefined,
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        const debugServer = Net.createServer(socket => {
            let rnDebugSession: DebugSessionBase;
            if (session.type === DEBUG_TYPES.REACT_NATIVE) {
                rnDebugSession = new RNDebugSession(session);
            } else {
                rnDebugSession = new DirectDebugSession(session);
            }

            this.connections.set(session.id, socket);

            rnDebugSession.setRunAsServer(true);
            rnDebugSession.start(<NodeJS.ReadableStream>socket, socket);
        });
        debugServer.listen(0);
        this.servers.set(session.id, debugServer);

        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer((<Net.AddressInfo>debugServer.address()).port);
    }

    public terminate(terminateEvent: TerminateEventArgs): void {
        this.destroyServer(
            terminateEvent.debugSession.id,
            this.servers.get(terminateEvent.debugSession.id),
        );

        let connection = this.connections.get(terminateEvent.debugSession.id);
        if (connection) {
            if (terminateEvent.args.forcedStop) {
                this.destroyConnection(connection);
            }
            this.connections.delete(terminateEvent.debugSession.id);
        }
    }

    public dispose(): void {
        this.servers.forEach((server, key) => {
            this.destroyServer(key, server);
        });
        this.connections.forEach((conn, key) => {
            this.destroyConnection(conn);
            this.connections.delete(key);
        });
    }

    private destroyConnection(connection: Net.Socket) {
        connection.removeAllListeners();
        connection.on("error", () => undefined);
        connection.destroy();
    }

    private destroyServer(sessionId: string, server?: Net.Server) {
        if (server) {
            server.close();
            this.servers.delete(sessionId);
        }
    }
}

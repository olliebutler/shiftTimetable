const React = require('react');
const ReactDOM = require('react-dom')
const client = require('./client');
const follow = require('./follow');
const when = require('when');
const stompClient = require('./websocket-listener')
const root = '/api';

class App extends React.Component {

	constructor(props) {
		super(props);
		this.state = {shifts: [], attributes: [], page: 1, pageSize: 10, links: {}};
		this.updatePageSize = this.updatePageSize.bind(this);
		this.onCreate = this.onCreate.bind(this);
		this.onUpdate = this.onUpdate.bind(this);
		this.onDelete = this.onDelete.bind(this);
		this.onNavigate = this.onNavigate.bind(this);
		this.refreshCurrentPage = this.refreshCurrentPage.bind(this);
		this.refreshAndGoToLastPage = this.refreshAndGoToLastPage.bind(this);
	}
	
	
	loadFromServer(pageSize) {
		follow(client, root, [
			{rel: 'shifts', params: {size: pageSize}}]
		).then(shiftCollection => {
			return client({
				method: 'GET',
				path: shiftCollection.entity._links.profile.href,
				headers: {'Accept': 'application/schema+json'}
			}).then(schema => {
				
				Object.keys(schema.entity.properties).forEach(function (property) {
					if (schema.entity.properties[property].hasOwnProperty('format') &&
						schema.entity.properties[property].format === 'uri') {
						delete schema.entity.properties[property];
					}
					else if (schema.entity.properties[property].hasOwnProperty('$ref')) {
						delete schema.entity.properties[property];
					}
				});
				this.schema = schema.entity;
				this.links = shiftCollection.entity._links;
				return shiftCollection;
			});
		}).then(shiftCollection => {
			this.page = shiftCollection.entity.page;
			return shiftCollection.entity._embedded.shifts.map(shift =>
					client({
						method: 'GET',
						path: shift._links.self.href
					})
			);
		}).then(shiftPromises => {
			return when.all(shiftPromises);
		}).done(shifts => {
			this.setState({
				
				page: this.page,
				shifts: shifts,
				attributes: Object.keys(this.schema.properties),
				pageSize: pageSize,
				links: this.links
			});
		});
	}
	
	onCreate(newShift) {
		follow(client, root, ['shifts']).done(response => {
			client({
				method: 'POST',
				path: response.entity._links.self.href,
				entity: newShift,
				headers: {'Content-Type': 'application/json'}
			})
		})
	}
	
	onUpdate(shift, updatedShift) {
		client({
			method: 'PUT',
			path: shift.entity._links.self.href,
			entity: updatedShift,
			headers: {
				'Content-Type': 'application/json',
				'If-Match': shift.headers.Etag
			}
		}).done(response => {
			
		}, response => {
			if (response.status.code === 403) {
				alert('ACCESS DENIED: You are not authorized to update ' +
					shift.entity._links.self.href);
			}
			if (response.status.code === 412) {
				alert('DENIED: Unable to update ' + shift.entity._links.self.href +
					'. Your copy is stale.');
			}
		});
	}
	
	onDelete(shift) {
		client({method: 'DELETE', path: shift.entity._links.self.href}
		).done(response => {/* let the websocket handle updating the UI */},
		response => {
			if (response.status.code === 403) {
				alert('ACCESS DENIED: You are not authorized to delete ' +
					shift.entity._links.self.href);
			}
		});
	}
	
	onNavigate(navUri) {
		client({
			method: 'GET',
			path: navUri
		}).then(shiftCollection => {
			this.links = shiftCollection.entity._links;
			this.page = shiftCollection.entity.page;

			return shiftCollection.entity._embedded.shifts.map(shift =>
					client({
						method: 'GET',
						path: shift._links.self.href
					})
			);
		}).then(shiftPromises => {
			return when.all(shiftPromises);
		}).done(shifts => {
			this.setState({
			
				page: this.page,
				shifts: shifts,
				attributes: Object.keys(this.schema.properties),
				pageSize: this.state.pageSize,
				links: this.links
			});
		});
	}
	
	updatePageSize(pageSize) {
		if (pageSize !== this.state.pageSize) {
			this.loadFromServer(pageSize);
		}
	}
	
	refreshAndGoToLastPage(message) {
		follow(client, root, [{
			rel: 'employees',
			params: {size: this.state.pageSize}
		}]).done(response => {
			if (response.entity._links.last !== undefined) {
				this.onNavigate(response.entity._links.last.href);
			} else {
				this.onNavigate(response.entity._links.self.href);
			}
		})
	}

	refreshCurrentPage(message) {
		follow(client, root, [{
			rel: 'shifts',
			params: {
				size: this.state.pageSize,
				page: this.state.page.number
			}
		}]).then(shiftCollection => {
			this.links = shiftCollection.entity._links;
			this.page = shiftCollection.entity.page;

			return shiftCollection.entity._embedded.shifts.map(shift => {
				return client({
					method: 'GET',
					path: shift._links.self.href
				})
			});
		}).then(shiftPromises => {
			return when.all(shiftPromises);
		}).then(shifts => {
			this.setState({
				page: this.page,
				shifts: shifts,
				attributes: Object.keys(this.schema.properties),
				pageSize: this.state.pageSize,
				links: this.links
			});
		});
	}

	componentDidMount() {
		this.loadFromServer(this.state.pageSize);
		stompClient.register([
			{route: '/topic/newShift', callback: this.refreshAndGoToLastPage},
			{route: '/topic/updateShift', callback: this.refreshCurrentPage},
			{route: '/topic/deleteShift', callback: this.refreshCurrentPage}
		]);
	}

	render() {
		return (
			<div>
				<CreateDialog attributes={this.state.attributes} onCreate={this.onCreate}/>
				<ShiftList page={this.state.page}
							  shifts={this.state.shifts}
							  links={this.state.links}
							  pageSize={this.state.pageSize}
							  attributes={this.state.attributes}
							  onNavigate={this.onNavigate}
							  onUpdate={this.onUpdate}
							  onDelete={this.onDelete}
							  updatePageSize={this.updatePageSize}/>
			</div>
		)
	}
}

class CreateDialog extends React.Component {

	constructor(props) {
		super(props);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleSubmit(e) {
		e.preventDefault();
		var newShift = {};
		this.props.attributes.forEach(attribute => {
			newShift[attribute] = ReactDOM.findDOMNode(this.refs[attribute]).value.trim();
		});
		this.props.onCreate(newShift);

		
		this.props.attributes.forEach(attribute => {
			ReactDOM.findDOMNode(this.refs[attribute]).value = '';
		});

		window.location = "#";
	}

	render() {
		var inputs = this.props.attributes.map(attribute =>
			<p key={attribute}>
				<input type="text" placeholder={attribute} ref={attribute} className="field" />
			</p>
		);

		return (
			<div>
				<a href="#createShift">Create</a>

				<div id="createShift" className="modalDialog">
					<div>
						<a href="#" title="Close" className="close">X</a>

						<h2>Create new shift</h2>

						<form>
							{inputs}
							<button onClick={this.handleSubmit}>Create</button>
						</form>
					</div>
				</div>
			</div>
		)
	}

}

class UpdateDialog extends React.Component {

	constructor(props) {
		super(props);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleSubmit(e) {
		e.preventDefault();
		var updatedShift = {};
		this.props.attributes.forEach(attribute => {
			updatedShift[attribute] = ReactDOM.findDOMNode(this.refs[attribute]).value.trim();
		});
		this.props.onUpdate(this.props.shift, updatedShift);
		window.location = "#";
	}

	render() {
		var inputs = this.props.attributes.map(attribute =>
				<p key={this.props.shift.entity[attribute]}>
					<input type="text" placeholder={attribute}
						   defaultValue={this.props.shift.entity[attribute]}
						   ref={attribute} className="field" />
				</p>
		);

		var dialogId = "updateShift-" + this.props.shift.entity._links.self.href;

		return (
				<div>
					<a href={"#" + dialogId}>Update</a>

					<div id={dialogId} className="modalDialog">
						<div>
							<a href="#" title="Close" className="close">X</a>

							<h2>Update an employee</h2>

							<form>
								{inputs}
								<button onClick={this.handleSubmit}>Update</button>
							</form>
						</div>
					</div>
				</div>
			)
		}

	}

class ShiftList extends React.Component{
	
	
	constructor(props) {
		super(props);
		this.handleNavFirst = this.handleNavFirst.bind(this);
		this.handleNavPrev = this.handleNavPrev.bind(this);
		this.handleNavNext = this.handleNavNext.bind(this);
		this.handleNavLast = this.handleNavLast.bind(this);
		this.handleInput = this.handleInput.bind(this);
	}
	
	
	handleInput(e) {
		e.preventDefault();
		var pageSize = ReactDOM.findDOMNode(this.refs.pageSize).value;
		if (/^[0-9]+$/.test(pageSize)) {
			this.props.updatePageSize(pageSize);
		} else {
			ReactDOM.findDOMNode(this.refs.pageSize).value =
				pageSize.substring(0, pageSize.length - 1);
		}
	}
	
	handleNavFirst(e){
		e.preventDefault();
		this.props.onNavigate(this.props.links.first.href);
	}

	handleNavPrev(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.prev.href);
	}

	handleNavNext(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.next.href);
	}

	handleNavLast(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.last.href);
	}
	
	
	render() {
		var pageInfo = this.props.page.hasOwnProperty("number") ?
				<h3>Shifts - Page {this.props.page.number + 1} of {this.props.page.totalPages}</h3> : null;


		var shifts = this.props.shifts.map(shift =>
			<Shift key={shift.entity._links.self.href}
					  shift={shift}
					  attributes={this.props.attributes}
					  onUpdate={this.props.onUpdate}
					  onDelete={this.props.onDelete}/>
		);
		
		var navLinks = [];
		if ("first" in this.props.links) {
			navLinks.push(<button key="first" onClick={this.handleNavFirst}>&lt;&lt;</button>);
		}
		if ("prev" in this.props.links) {
			navLinks.push(<button key="prev" onClick={this.handleNavPrev}>&lt;</button>);
		}
		if ("next" in this.props.links) {
			navLinks.push(<button key="next" onClick={this.handleNavNext}>&gt;</button>);
		}
		if ("last" in this.props.links) {
			navLinks.push(<button key="last" onClick={this.handleNavLast}>&gt;&gt;</button>);
		}
		
		return (
				<div>
					{pageInfo}
					<input ref="pageSize" defaultValue={this.props.pageSize} onInput={this.handleInput}/>
					<table>
						<tbody>
							<tr>
								<th>Date</th>
								<th>Shift Type</th>
								<th>Staff Member</th>
								<th>Manager</th>
								<th></th>
							</tr>
							{shifts}
						</tbody>
					</table>
					<div>
						{navLinks}
					</div>
				</div>
			)
		}
	}

class Shift extends React.Component{

	constructor(props) {
		super(props);
		this.handleDelete = this.handleDelete.bind(this);
	}

	handleDelete() {
		this.props.onDelete(this.props.shift);
	}

	render() {
		return (
			<tr>
				<td>{this.props.shift.entity.date}</td>
				<td>{this.props.shift.entity.shiftType}</td>
				<td>{this.props.shift.entity.staffMember}</td>
				<td>{this.props.shift.entity.manager.name}</td>
				<td>
					<UpdateDialog shift={this.props.shift}
								  attributes={this.props.attributes}
								  onUpdate={this.props.onUpdate}/>
				</td>
				<td>
					<button onClick={this.handleDelete}>Delete</button>
				</td>
			</tr>
		)
	}
}

ReactDOM.render(
		<App />,
		document.getElementById('react')
	)
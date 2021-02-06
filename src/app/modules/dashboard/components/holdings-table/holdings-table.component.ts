import {Component, Input} from '@angular/core';
import {Router} from '@angular/router';

@Component({
  selector: 'app-holdings-table',
  templateUrl: './holdings-table.component.html',
  styleUrls: ['./holdings-table.component.scss'],
})
export class HoldingsTableComponent {
  constructor(private readonly router: Router) {
  }

  @Input() portfolio;

  goToReef() {
    this.router.navigate(['/reef/buy']);
  }
}
